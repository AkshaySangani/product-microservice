
import { Response } from 'express';

export class apiResponse {
    private status: number | null
    private message: string | null
    private data: any | null
    private error: any | null
    constructor(status: number, message: string, data: any, error: any) {
        this.status = status
        this.message = message
        this.data = data
        this.error = error
    }
}

const sendApiResponse = (
    res: Response,
    statusCode: number,
    message: string,
    data: any = {},
    error: any = {}
  ): Response => {
    const response = new apiResponse(statusCode, message, data, error);
    return res.status(statusCode).json(response);
  };
  
  export default sendApiResponse;