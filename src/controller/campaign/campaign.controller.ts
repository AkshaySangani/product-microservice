import { Response } from "express";
import sendApiResponse from "../../common";
import { AuthRequest } from "../../types/authRequest";
import { CampaignModel } from "../../database/model";
import { deleteFromS3, uploadToS3 } from "../../lib/s3";

export const createCampaign = async (req: AuthRequest, res: Response) => {
    const { _id: vendorId } = req.user;

    try {
        // STEP 1: Destructure the campaign details from request body
        const {
            name,
            description,
            startDate,
            endDate,
            productId,
            channels,
            discount_type,
            discount_value,
        } = req.body;

        // STEP 2: Validate input data using custom validator
        const validation: any = checkCampaignValidation(req.body);
        if (!validation.status)
            return sendApiResponse(res, 400, validation.message);

        // STEP 3: Dynamically calculate the initial campaign status based on current date
        let status: "ACTIVE" | "PENDING" | "EXPIRED" = "PENDING";
        const now = new Date();

        if (new Date(startDate) <= now && new Date(endDate) >= now) {
            status = "ACTIVE";
        } else if (new Date(endDate) < now) {
            status = "EXPIRED";
        }

        // STEP 4: Save the new campaign to the database
        const campaign = await new CampaignModel({
            name,
            description,
            startDate,
            endDate,
            status,
            productId,
            channels,
            discount_type,
            discount_value,
            vendorId,
        });

        // STEP 5: Handle media file uploads (video & images)
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        const uploadPath = `vendor/${vendorId}/campaigns`;

        // Upload video
        if (files?.video?.[0]) {
            const file = files.video[0];
            const upload = await uploadToS3(
                file.buffer,
                file.originalname,
                file.mimetype,
                `${uploadPath}/videos`
            );
            if (upload?.url) {
                campaign.videoUrl = upload.url;
            }
        }

        // Upload images
        if (files?.images?.length) {
            const imageUploadPromises = files.images.map((file) =>
                uploadToS3(
                    file.buffer,
                    file.originalname,
                    file.mimetype,
                    `${uploadPath}/images`
                )
            );
            const imageResults = await Promise.all(imageUploadPromises);
            const imageUrls = imageResults.map((res) => res.url).filter(Boolean);
            if (imageUrls.length) {
                campaign.imageUrls = imageUrls;
            }
        }

        // STEP 6: Save campaign to DB
        await campaign.save();

        // STEP 7: Return success response with the created campaign data
        return sendApiResponse(res, 201, "Campaign created successfully", {
            data: campaign,
        });
    } catch (error: any) {
        console.error("create campaign error:", error);
        return sendApiResponse(res, 500, "Internal server error", {
            error: error.message,
        });
    }
};

export const updateCampaign = async (req: AuthRequest, res: Response) => {
    const { _id: vendorId } = req.user;
    const campaignId = req.params.campaignId;

    try {
        // STEP 1: Check if campaign exists and belongs to current vendor
        const existingCampaign = await CampaignModel.findById(campaignId);
        if (!existingCampaign) {
            return sendApiResponse(res, 404, "Campaign not found.");
        }

        // STEP 2: Extract fields from body (user may update partial data)
        const {
            name,
            description,
            startDate,
            endDate,
            productId,
            channels,
            discount_type,
            discount_value,
            deleteMedias = [], // URLs to delete from S3
        } = req.body;

        // STEP 3: Filter out only non-falsy fields to update
        const updateFields: any = {};
        if (name) updateFields.name = name;
        if (description) updateFields.description = description;
        if (startDate) updateFields.startDate = new Date(startDate);
        if (endDate) updateFields.endDate = new Date(endDate);
        if (productId) updateFields.productId = productId;
        if (channels && Array.isArray(channels)) updateFields.channels = channels;
        if (discount_type) updateFields.discount_type = discount_type;
        if (discount_value || discount_value === 0)
            updateFields.discount_value = discount_value;

        // STEP 4: Optional validation before saving
        const validation: any = checkCampaignValidation({
            ...existingCampaign.toObject(),
            ...updateFields,
        });
        if (!validation.status) {
            return sendApiResponse(res, 400, validation.message);
        }

        // STEP 5: Recalculate status if dates were updated
        if (updateFields.startDate || updateFields.endDate) {
            const now = new Date();
            const updatedStart = updateFields.startDate || existingCampaign.startDate;
            const updatedEnd = updateFields.endDate || existingCampaign.endDate;

            if (updatedStart <= now && updatedEnd >= now) {
                updateFields.status = "ACTIVE";
            } else if (updatedEnd < now) {
                updateFields.status = "EXPIRED";
            } else {
                updateFields.status = "PENDING";
            }
        }

        // STEP 6: Handle media uploads (video/images)
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        const uploadPath = `vendor/${vendorId}/campaigns`;

        // Upload new video (if present)
        if (files?.video?.[0]) {
            const file = files.video[0];
            const upload = await uploadToS3(
                file.buffer,
                file.originalname,
                file.mimetype,
                `${uploadPath}/videos`
            );
            if (upload?.url) {
                updateFields.videoUrl = upload.url;
            }
        }

        // Upload new images (if present)
        if (files?.images?.length) {
            const imageUploadPromises = files.images.map((file) =>
                uploadToS3(
                    file.buffer,
                    file.originalname,
                    file.mimetype,
                    `${uploadPath}/images`
                )
            );
            const imageResults = await Promise.all(imageUploadPromises);
            const imageUrls = imageResults.map((res) => res.url).filter(Boolean);

            if (imageUrls.length) {
                updateFields.imageUrls = [...(existingCampaign?.imageUrls || []), ...imageUrls];
            }
        }

        // STEP 7: Handle media deletion from S3 and clean up DB
        if (typeof deleteMedias === "string") {
            try {
                const parsedMedias = JSON.parse(deleteMedias);
                if (Array.isArray(parsedMedias)) {
                    const deletePromises = parsedMedias.map(async (url: string) => {
                        const filePath = url.split(".com/")[1];
                        if (filePath) await deleteFromS3(filePath);
                    });
                    await Promise.all(deletePromises);

                    // Remove deleted URLs from DB fields
                    const updatedImageUrls =
                        existingCampaign.imageUrls?.filter(
                            (url) => !parsedMedias.includes(url)
                        ) || [];

                    const shouldDeleteVideo =
                        existingCampaign.videoUrl &&
                        parsedMedias.includes(existingCampaign.videoUrl);

                    updateFields.imageUrls = updatedImageUrls;
                    if (shouldDeleteVideo) {
                        updateFields.videoUrl = null;
                    }
                } else {
                    console.warn("deleteMedias is not a valid array:", deleteMedias);
                }
            } catch (err) {
                console.warn("Invalid JSON in deleteMedias:", deleteMedias);
            }
        }


        // STEP 8: Update campaign and return updated object
        const updatedCampaign = await CampaignModel.findByIdAndUpdate(
            campaignId,
            { $set: updateFields },
            { new: true }
        );

        return sendApiResponse(res, 200, "Campaign updated successfully", {
            data: updatedCampaign,
        });
    } catch (error: any) {
        console.error("update campaign error:", error);
        return sendApiResponse(res, 500, "Internal server error", {
            error: error.message,
        });
    }
};

export const getCampaignById = async (req: AuthRequest, res: Response) => {
    try {
        const campaignId = req.params.campaignId;
        const campaign = await CampaignModel.findById(campaignId).populate("productId");

        if (!campaign) {
            return sendApiResponse(res, 404, "Campaign not found.");
        }

        return sendApiResponse(res, 200, "Campaign fetched successfully", {
            data: campaign,
        });
    } catch (error: any) {
        console.error("get campaign by id error:", error);
        return sendApiResponse(res, 500, "Internal server error", {
            error: error.message,
        });
    }
};

export const getCampaignList = async (req: AuthRequest, res: Response) => {
    try {
      const { search = "", status, limit = 20, page = 1 } = req.query;
      const { _id: vendorId } = req.user;
  
      const query: any = {
        vendorId,
      };
  
      // Search by campaign name (case-insensitive)
      if (search && typeof search === "string") {
        query.name = { $regex: search, $options: "i" };
      }
  
      // Filter by status
      if (status && typeof status === "string") {
        query.status = status.toUpperCase(); // Ensure status like "ACTIVE"
      }
  
      const campaigns = await CampaignModel.find(query)
        .populate("productId")
        .skip((+page - 1) * +limit)
        .limit(+limit)
        .sort({ createdAt: -1 });
  
      const count= await CampaignModel.countDocuments(query);
  
      return sendApiResponse(res, 200, "Campaigns fetched successfully", {
         campaigns,
         count,
        }
      );
    } catch (error: any) {
      console.error("search campaigns error:", error);
      return sendApiResponse(res, 500, "Internal server error", {
        error: error.message,
      });
    }
  };

export const updateCampaignStatuses = async () => {
    try {
        const now = new Date();

        // 1. Expire campaigns where endDate has passed
        await CampaignModel.updateMany(
            { endDate: { $lt: now }, status: { $ne: "EXPIRED" } },
            { $set: { status: "EXPIRED" } }
        );

        // 2. Activate campaigns where startDate <= now <= endDate
        await CampaignModel.updateMany(
            {
                startDate: { $lte: now },
                endDate: { $gte: now },
                status: { $ne: "ACTIVE" },
            },
            { $set: { status: "ACTIVE" } }
        );

        // 3. Set to pending if startDate is in the future
        //   await CampaignModel.updateMany(
        //     {
        //       startDate: { $gt: now },
        //       endDate: { $gte: now },
        //       status: { $ne: "PENDING" },
        //     },
        //     { $set: { status: "PENDING" } }
        //   );

        console.log("✅ Campaign status update completed.");
    } catch (error) {
        console.error("❌ Error updating campaign statuses:", error);
    }
};

const checkCampaignValidation = (data: any) => {
    const {
        name,
        description,
        startDate,
        endDate,
        productId,
        channels,
        discount_type,
        discount_value,
    } = data;
    if (!name || !description || !startDate || !endDate) {
        return {
            status: false,
            message:
                "Campaign name, description, start date and end date are required",
        };
    } else if (discount_type && !discount_value) {
        return { status: false, message: "Discount value is required" };
    } else if (discount_type && discount_value <= 0) {
        return { status: false, message: "Discount value must be greater than 0" };
    } else if (channels.length === 0) {
        return { status: false, message: "At least one channel is required" };
    } else if (!productId) {
        return { status: false, message: "Product is required" };
    }
    return { status: true };
};
