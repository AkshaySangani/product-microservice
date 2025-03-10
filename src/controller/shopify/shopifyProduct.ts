import { Request, Response } from "express";
import sendApiResponse from "../../common";

const getShopifyProductList = async (req: Request, res: Response) => {
    try {
        const { shop= "qreff-testing-stage.myshopify.com", per_page = 20 } = req.body; // Extract parameters from request body

        if (!shop) {
            return sendApiResponse(res, 400, "Missing required parameter: shop");
        }

        const formData = new URLSearchParams();
        formData.append("shop", shop);
        formData.append("per_page", per_page.toString());

        const response = await fetch('https://qreff-integration.terreza.com/api/admin/product/list', {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": `Bearer 3|YFBKQkQztTTrxhWn5PZnXxZVuK4kVuu7ST61VFzWbec38bdd`
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Shopify Product List Error: ${response.status} - ${errorText}`);
            return sendApiResponse(res, response.status, "Failed to fetch Shopify product list", { error: errorText });
        }

        const data = await response.json();

        if (!data || !data.data || !data.data.products) {
            console.error("Invalid response structure from Shopify API", data);
            return sendApiResponse(res, 502, "Bad Gateway - Unexpected response structure", data);
        }

        console.log("Shopify Products Data:", data);
        return sendApiResponse(res, 200, "Shopify product list fetched successfully", data.data);
    } catch (error: any) {
        console.error("Unexpected error during Shopify product list fetch:", error);

        if (error.name === "FetchError") {
            return sendApiResponse(res, 502, "Bad Gateway - Unable to reach Shopify API");
        }

        return sendApiResponse(res, 500, "Internal server error", { error: error.message });
    }
};

export { getShopifyProductList };
