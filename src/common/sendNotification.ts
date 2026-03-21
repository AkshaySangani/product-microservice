import axios from "axios"
import { BACKEND_URL } from "../config"
import { AuthRequest } from "../types/authRequest";

type Data = {
    _id: string,
    title: string,
    message: string,
    sender: string,
    userType: string,
    notificationType: string,
    path: string
}

const sendNotification = async (req: AuthRequest, data: Data) => {
    await axios.post(BACKEND_URL + '/message/notification/send-notification', {
        ...data
    },
        {
            headers: {
                'Authorization': req.headers.Authorization
            }
        }
    )
}

export { sendNotification };
