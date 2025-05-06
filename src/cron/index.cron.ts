import cron from "node-cron";
import { updateCampaignStatuses } from "../controller/campaign/campaign.controller";
import { updateCollaborationStatus } from "../controller/collaboration/collaboration.controller";

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

cron.schedule(
  "5 0 * * *",
  async () => {
    await updateCollaborationStatus();
  },
  {
    scheduled: true,
    timezone: "Asia/Kolkata", // Indian Standard Time (IST)
  }
);

//   },
//   {
//     scheduled: true,
//     timezone: "Asia/Kolkata",
//   }
// );

export default cron;
