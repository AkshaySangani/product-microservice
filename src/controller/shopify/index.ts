import { Request, Response } from "express";
import sendApiResponse from "../../common";

const loginToShopify = async (): Promise<{ token?: string } | null> => {
    try {
        const formData = new URLSearchParams();
        formData.append("email", "admin@test.com");
        formData.append("password", "admin");

        const response = await fetch("https://qreff-integration.terreza.com/api/admin/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData,
        });

        if (!response.ok) {
            console.error(`Shopify Login Error: ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error("Unexpected error during Shopify login:", error);
        return null;
    }
};

const connectShopifyStore = async (req: Request, res: Response) => {
    try {
        const loginData = await loginToShopify();

        if (!loginData || !loginData.token) {
            return sendApiResponse(res, 401, "Unauthorized - Shopify login failed");
        }

        const response = await fetch("https://qreff-integration.terreza.com/api/admin/shop", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${loginData.token}`
            },
            body: JSON.stringify({
                id_string: "3c9e5138-cd53-4437-99d9-2d47d8c42f37"
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Shopify Shop Fetch Error: ${response.status} - ${errorText}`);
            return sendApiResponse(res, response.status, "Failed to fetch shop details", { error: errorText });
        }

        const data = await response.json();
        return sendApiResponse(res, 200, "Shop connected successfully", data);

    } catch (error: any) {
        console.error("Unexpected error during Shopify store connection:", error);

        if (error.name === "FetchError") {
            return sendApiResponse(res, 502, "Bad Gateway - Unable to reach Shopify API");
        }

        return sendApiResponse(res, 500, "Internal server error", { error: error.message });
    }
};

export { connectShopifyStore };
