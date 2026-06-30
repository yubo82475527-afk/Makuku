import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const mobileFeishuAutoLogin = readFileSync("src/components/mobile-feishu-auto-login.tsx", "utf8");
const pcLoginForm = readFileSync("src/components/pc-login-form.tsx", "utf8");

test("Feishu client flows only load H5 SDK inside supported Feishu containers", () => {
  for (const source of [mobileFeishuAutoLogin, pcLoginForm]) {
    assert.match(source, /navigator\.userAgent/);
    assert.match(source, /feishu|lark|ttwebview/i);
    assert.match(source, /const \[isFeishuContainer\] = useState\(\(\) => \(/);
    assert.match(source, /typeof navigator === "undefined" \? false : isFeishuUserAgent\(navigator\.userAgent\)/);
    assert.match(source, /if \(!isFeishuContainer\) return/);
    assert.match(source, /isFeishuContainer && feishuAppId/);
  }
});
