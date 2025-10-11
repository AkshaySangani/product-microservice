import axios from "axios"
import { BACKEND_URL } from "../config"
import { AuthRequest } from "../types/authRequest";

const sendNotification = async (req: AuthRequest, userIds: string[], message: string, userType: string, notificationType: string,path?:string) => {
    await axios.post(BACKEND_URL + '/message/notification/send-notification', {
        userIds,
        message,
        userType,
        notificationType,
        path,
    },
        {
            headers: {
                'Authorization': req.headers.Authorization
            }
        }
    )
}

export { sendNotification };
