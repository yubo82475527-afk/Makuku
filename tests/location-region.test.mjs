import test from "node:test";
import assert from "node:assert/strict";

import { buildLocationRegion, buildLocationRegionParts } from "../src/lib/location-region.mjs";

test("China reverse geocode keeps municipality non-empty without using a business quarter as district", () => {
  const region = buildLocationRegion({
    display_name: "延安东路, 大世界, 上海市, 200021, 中国",
    address: {
      road: "延安东路",
      quarter: "大世界",
      city: "上海市",
      postcode: "200021",
      country: "中国",
      country_code: "cn",
    },
  });

  assert.equal(region, "上海市");
});

test("China reverse geocode prefers city and district over street-level fallback", () => {
  const region = buildLocationRegion({
    display_name: "工人体育场北路, 三里屯街道, 朝阳区, 北京市, 100027, 中国",
    address: {
      road: "工人体育场北路",
      suburb: "三里屯街道",
      city_district: "朝阳区",
      city: "北京市",
      postcode: "100027",
      country: "中国",
      country_code: "cn",
    },
  });

  assert.equal(region, "北京市 / 朝阳区");
});

test("China reverse geocode fills a missing address city from display hierarchy", () => {
  const region = buildLocationRegion({
    display_name: "森那美大厦, 1, 科艺路, 麻雀岭工业区, 麻岭社区, 粤海街道, 南山区, 深圳市, 广东省, 518000, 中国",
    address: {
      road: "科艺路",
      city_district: "南山区",
      state: "广东省",
      postcode: "518000",
      country: "中国",
      country_code: "cn",
    },
  });

  assert.equal(region, "广东省 / 深圳市 / 南山区");
});

test("China reverse geocode falls back to coordinates when LocationIQ omits admin parts", () => {
  const region = buildLocationRegion({
    display_name: "华徐公路, 201702, 中国",
    address: {
      road: "华徐公路",
      postcode: "201702",
      country: "中国",
      country_code: "cn",
    },
  }, { latitude: 31.1629, longitude: 121.2787 });

  assert.equal(region, "上海市 / 青浦区");
});

test("Indonesia reverse geocode uses display hierarchy when address.region is only an island", () => {
  const region = buildLocationRegion({
    display_name: "RW 08, Pasar Manggis, Setiabudi, South Jakarta, Special Capital Region of Jakarta, Java, 12850, Indonesia",
    address: {
      city_block: "RW 08",
      village: "Pasar Manggis",
      city: "South Jakarta",
      region: "Java",
      postcode: "12850",
      country: "Indonesia",
      country_code: "id",
    },
  });

  assert.equal(region, "Special Capital Region of Jakarta / South Jakarta / Setiabudi");
});

test("Indonesia reverse geocode ignores RT and RW blocks and returns province city district", () => {
  const region = buildLocationRegion({
    display_name: "RW 01, Genteng, Surabaya, Jawa Timur, 60275, Indonesia",
    address: {
      city_block: "RW 01",
      district: "Genteng",
      city: "Surabaya",
      state: "Jawa Timur",
      postcode: "60275",
      country: "Indonesia",
      country_code: "id",
    },
  });

  assert.equal(region, "Jawa Timur / Surabaya / Genteng");
});

test("Indonesia reverse geocode limits region to province city district when village is also present", () => {
  const region = buildLocationRegion({
    display_name: "Dauh Puri Kelod, Denpasar Barat, Denpasar, Bali, 80113, Indonesia",
    address: {
      village: "Dauh Puri Kelod",
      city_district: "Denpasar Barat",
      city: "Denpasar",
      state: "Bali",
      postcode: "80113",
      country: "Indonesia",
      country_code: "id",
    },
  });

  assert.equal(region, "Bali / Denpasar / Denpasar Barat");
});

test("reverse geocode exposes structured province city district parts for dashboard filters", () => {
  const parts = buildLocationRegionParts({
    display_name: "Dauh Puri Kelod, Denpasar Barat, Denpasar, Bali, 80113, Indonesia",
    address: {
      village: "Dauh Puri Kelod",
      city_district: "Denpasar Barat",
      city: "Denpasar",
      state: "Bali",
      postcode: "80113",
      country: "Indonesia",
      country_code: "id",
    },
  });

  assert.deepEqual(parts, {
    province: "Bali",
    cityName: "Denpasar",
    district: "Denpasar Barat",
    region: "Bali / Denpasar / Denpasar Barat",
  });
});
