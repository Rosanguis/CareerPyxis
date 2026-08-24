import { initBotId } from "botid/client/core";

initBotId({
  protect: [
    { path: "/api/explore", method: "POST", advancedOptions: { checkLevel: "basic" } },
    { path: "/api/job-verification", method: "POST", advancedOptions: { checkLevel: "basic" } },
  ],
});
