import { Response, Request } from "express";
import { uploadToS3 } from "../lib/s3";
import sendApiResponse from "../common";

export const uploadMedia = async (req: Request, res: Response) => {
    // Upload creator material files to S3
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    try {
        let media: any = [];
        if (files?.media?.length) {
            const path = `products/materials`;
            const uploadedFiles = await Promise.all(
                files.media.map((file) =>
                    uploadToS3(file.buffer, file.originalname, file.mimetype, path)
                )
            );
            media = uploadedFiles.map((upload) => upload.url);
        }

        return sendApiResponse(res, 201, "Media added successfully", {
            media: media,
        });
    } catch (e: any) {
        console.error("Error while adding uploadMedia:", e);

        return sendApiResponse(res, 500, "Internal server error", {
            error: e.message || "Unknown error",
        });
    }
}