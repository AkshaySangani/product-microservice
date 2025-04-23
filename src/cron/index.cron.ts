import cron from "node-cron";
import { updateCampaignStatuses } from "../controller/campaign/campaign.controller";

//Run at 0:10 Am every day
cron.schedule(
  "10 0 * * *",
  async () => {
    await updateCampaignStatuses();
  },
  {
    scheduled: true,
    timezone: "Asia/Kolkata", // Indian Standard Time (IST)
  }
);

// cron.schedule(
//   "* * * * *",
//   async () => {
//     console.log("Running task every minute...");
//     await updateCampaignStatuses();
//   },
//   {
//     scheduled: true,
//     timezone: "Asia/Kolkata",
//   }
// );

export default cron;
