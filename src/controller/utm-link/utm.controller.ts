import { Response } from "express";
import sendApiResponse from "../../common";
import {
  ChannelModel,
  CollaborationModel,
  CreatorModel,
} from "../../database/model";
import { AuthRequest } from "../../types/authRequest";
import { SHOPIFY_API_KEY, SHOPIFY_URL, WORDPRESS_URL } from "../../config";

/**
 * @desc Generate UTM link for a collaboration (only if the vendor's channel is Shopify)
 * @route POST /api/collaboration/generate-utm
 * @access Private (Vendor only)
 */
export const createShopifyUTM = async (req: AuthRequest, res: Response) => {
  try {
    const { collaborationId } = req.params;

    if (!collaborationId) {
      throw new Error("Collaboration ID is required");
    }

    // 1. Find collaboration
    const collaboration: any = await CollaborationModel.findById(
      collaborationId
    ).populate("productId");
    if (!collaboration) {
      throw new Error("Collaboration not found");
    }

    // 2. Get vendor's active Shopify channel
    const channel = await ChannelModel.findOne({
      vendorId: collaboration.vendorId,
      channelType: "shopify",
      channelStatus: "active",
    });

    if (!channel) {
      throw new Error("Channel not found or not active");
    }

    const creator: any = await CreatorModel.findById(collaboration.creatorId);

    // 3. Send UTM generation request
    const response = await fetch(
      `https://qreff-integration.terreza.com/api/admin/utm/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer " + channel.channelConfig.access_token,
          Accept: "application/json",
        },
        body: JSON.stringify({
          discount_type: collaboration.discountType ?? 0,
          discount_value: collaboration.discountValue ?? 0,
          coupon_code: collaboration.couponCode ?? "",
          commission_value: collaboration.commissionValue ?? 0,
          commission_type: collaboration.commissionType ?? 0,
          contract_start_date: collaboration.startAt ?? new Date(),
          expires_at: collaboration.expiresAt ?? new Date(),
          product_id: collaboration?.productId?.channelProductId,
          creator_id: creator?._id,
          creator_name: creator?.full_name,
          collaboration_id: collaboration._id,
          shop: channel.channelConfig.domain,
          status: "ACTIVE",
        }),
      }
    );

    const contentType = response.headers.get("content-type");

    let data;
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text(); // read plain text error
      return sendApiResponse(
        res,
        response.status,
        text || "Non-JSON error response from UTM service."
      );
    }

    if (!response.ok) {
      return sendApiResponse(
        res,
        response.status,
        data.message || "Error generating UTM link"
      );
    }

    // Update collaboration with UTM link and set status to ACTIVE
    collaboration.utmLink = data.data?.link_url;
    collaboration.collaborationStatus = "ACTIVE";

    await collaboration.save();

    return sendApiResponse(res, 201, "UTM link generated successfully", {
      collaboration,
    });
  } catch (error: any) {
    console.error("Error generating UTM link:", error, error.message);
    return false;
  }
};

export const createShopifyUTMnew = async (data: any) => {
  const {
    shopUrl,
    productIdentifier,
    crmAffiliateId,
    couponCode,
    couponDiscountType,
    couponDiscountValue,
  } = data;
  try {
    const apiKey = SHOPIFY_API_KEY;
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["x-crm-api-key"] = apiKey;
    }

    const response = await fetch(`${SHOPIFY_URL}/crm/generate-trackable-link`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        shopUrl,
        productIdentifier,
        identifierType: "id",
        crmAffiliateId,
        couponCode,
        couponDiscountType: couponDiscountType, // or "FIXED_AMOUNT"
        couponDiscountValue,
        // couponStartDate: '', // ISO format if needed
        // couponEndDate: '',   // ISO format if needed
      }),
    });

    const data = await response.json();
    console.log("Response:", data);
    return data;
  } catch (e: any) {
    console.error("Error generating UTM link:", e);
    throw new Error("Error generating UTM link:");
  }
};

export const createWordpressUTM = async (data: any) => {
  const {
    token,
    productIdentifier,
    crmAffiliateId,
    couponCode,
    couponDiscountType,
    couponDiscountValue,
  } = data;
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    const response = await fetch(
      `${WORDPRESS_URL}/wp-json/crm-integration/links/generate?token=${token}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          productIdentifier,
          identifierType: "id",
          crmAffiliateId,
          couponCode,
          couponDiscountType: couponDiscountType, // or "FIXED_AMOUNT"
          couponDiscountValue,
          // couponStartDate: '', // ISO format if needed
          // couponEndDate: '',   // ISO format if needed
        }),
      }
    );

    const data = await response.json();
    console.log("Response:", data);
    return data;
  } catch (e: any) {
    console.error("Error generating UTM link:", e);
    throw new Error("Error generating UTM link:");
  }
};

export const shopifyCouponUpdate = async (data: any) => {
  const {
    productId,
    shopUrl,
    productIdentifier,
    couponCode,
    couponDiscountType,
    couponDiscountValue,
  } = data;

  try {
    const collaborations = await CollaborationModel.find({
      productId: productId,
    }).select("_id utmLinkIdentifier");

    const apiKey = SHOPIFY_API_KEY;
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["x-crm-api-key"] = apiKey;
    }

    const results: any[] = [];

    for (const collaboration of collaborations) {
      const response = await fetch(
        `${SHOPIFY_URL}/crm/update-trackable-link-with-coupon`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            utmappLinkId: collaboration.utmLinkIdentifier,
            shopUrl,
            productIdentifier,
            identifierType: "id",
            crmAffiliateId: collaboration._id.toString(),
            couponCode,
            couponDiscountType,
            couponDiscountValue,
            isUpdateCoupon: true,
          }),
        }
      );

      const result = await response.json();

      // ✅ Update utmLink in DB if a new link is returned
      if (result?.newShareableLink) {
        console.log("result.newShareableLink",result.newShareableLink, collaboration.utmLinkIdentifier)
        await CollaborationModel.updateOne(
          { utmLinkIdentifier: collaboration.utmLinkIdentifier },
          { $set: { utmLink: result.newShareableLink } }
        );
      }

      results.push({
        utmLink: collaboration.utmLinkIdentifier,
        status: response.status,
        response: result,
      });
    }

    console.log("All responses:", results);
    return results;
  } catch (e: any) {
    console.error("Error updating coupon code", e);
    throw new Error("Error updating coupon code");
  }
};


export const shopifyUpdateDiscount = async (data: any) => {
  const {
    productId,
    shopUrl,
    productIdentifier,
    couponCode,
    couponDiscountType,
    couponDiscountValue,
  } = data;

  try {
    const collaborations = await CollaborationModel.find({
      productId: productId,
    }).select("_id utmLinkIdentifier");

    const apiKey = SHOPIFY_API_KEY;
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["x-crm-api-key"] = apiKey;
    }

    const results: any[] = [];

    for (const collaboration of collaborations) {
      const response = await fetch(
        `${SHOPIFY_URL}/crm/update-trackable-link-with-coupon`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            utmappLinkId: collaboration.utmLinkIdentifier,
            shopUrl,
            productIdentifier,
            identifierType: "id",
            crmAffiliateId: collaboration._id.toString(),
            couponCode,
            couponDiscountType,
            couponDiscountValue,
          }),
        }
      );

      const result = await response.json();

      // // ✅ Update utmLink in DB if a new link is returned
      // if (result?.newShareableLink) {
      //   await CollaborationModel.updateOne(
      //     { utmLinkIdentifier: collaboration.utmLinkIdentifier },
      //     { $set: { utmLink: result.newShareableLink } }
      //   );
      // }

      results.push({
        utmLink: collaboration.utmLinkIdentifier,
        status: response.status,
        response: result,
      });
    }

    console.log("All responses:", results);
    return results;
  } catch (e: any) {
    console.error("Error updating coupon code", e);
    throw new Error("Error updating coupon code");
  }
};

