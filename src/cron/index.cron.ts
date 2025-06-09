import cron from "node-cron";
import { updateCollaborationStatus } from "../controller/collaboration/collaboration.controller";
import { updateProductStatus } from "../controller/product/product.controller";

//Run at 0:01 Am every day
cron.schedule(
  "1 0 * * *",
  async () => {
    await updateProductStatus();
  },
  {
    scheduled: true,
    timezone: "Asia/Kolkata", // Indian Standard Time (IST)
  }
);

cron.schedule(
  "5 0 * * *",
  async () => {
    // await updateCollaborationStatus();
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
