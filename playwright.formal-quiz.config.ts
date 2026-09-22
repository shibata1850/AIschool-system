import {defineConfig} from "@playwright/test";
import {randomBytes} from "node:crypto";
process.loadEnvFile(".env.test");
for(const key of ["DATABASE_URL","DATABASE_ADMIN_URL"]) {
  const url=new URL(process.env[key]!);
  if(url.hostname!=="127.0.0.1" || !["55442","55444"].includes(url.port) || url.pathname!=="/aischool_test") throw new Error("Isolated quiz test database required");
}
process.env.LTI_SESSION_SECRET ||= randomBytes(48).toString("hex");
const app="http://127.0.0.1:3128", canvas="http://127.0.0.1:3129";
export default defineConfig({
  testDir:"./e2e/regression",testMatch:"2026-09-22-formal-quiz.spec.ts",workers:1,forbidOnly:true,retries:0,
  timeout:90000,expect:{timeout:15000},reporter:"list",
  use:{baseURL:app,launchOptions:process.platform==='win32'?{executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"}:undefined},
  projects:[
    {name:"nuc",use:{viewport:{width:1366,height:768}}},
    {name:"quest-layout",use:{viewport:{width:1440,height:900}}},
    {name:"nearhub",use:{viewport:{width:1920,height:1080},hasTouch:true}},
  ],
  webServer:[
    {command:"node tools/quiz-review-e2e/start.mjs",url:canvas+"/health",reuseExistingServer:false},
    {command:"node node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p 3128",url:app,reuseExistingServer:false,timeout:120000,
      env:{...process.env,NEXT_TELEMETRY_DISABLED:"1",DEV_COOKIE_ROLES:"",DEMO_RICH_SEED:"",ALLOW_DEV_RESET:"",
        QUIZ_ACHIEVEMENT_ENABLED:"true",QUIZ_REVIEW_PUBLICATION_ENABLED:"true",CANVAS_BASE_URL:canvas,CANVAS_API_TOKEN:"fictional-quiz-review-token",CANVAS_REVIEW_INSTANCE:"test-canvas",
        CANVAS_REVIEW_ORIGIN:canvas,LTI_ISSUER:canvas,LTI_CLIENT_ID:"fictional-client",
        LTI_AUTH_URL:canvas+"/unused",LTI_JWKS_URL:canvas+"/unused",LTI_TOOL_URL:app}},
  ],
});

