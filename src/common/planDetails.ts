import { SubscriptionModel } from "../database/model"

const planDetails = async (vendorId: string) => {
    const subScription = await SubscriptionModel.findOne({ vendorId }).populate('planId')
    return subScription
}

export { planDetails }