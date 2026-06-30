"use client";

import { ArrowLeft, Building2, Camera, CheckCircle2, Loader2, LocateFixed, LogIn, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoadingOverlay } from "@/components/loading-overlay";
import type { Locale } from "@/lib/i18n/config";
import { getMobileCopy, mobileImageCategoryLabel } from "@/lib/mobile-i18n";

const maxImages = 20;
const uploadConcurrency = 3;
const maxUploadBytes = 20 * 1024 * 1024;
const compressionMaxSide = 3000;
const compressionQuality = 0.9;
const storageKey = "makuku_app_user";
const imageCategoryOrder = ["makuku_shelf", "competitor_shelf", "storefront"] as const;
type ImageCategory = (typeof imageCategoryOrder)[number];

const photoExampleImages = {
  correct: [
    "/store-visit-photo-examples/correct-1.jpeg",
    "/store-visit-photo-examples/correct-2.jpg",
    "/store-visit-photo-examples/correct-3.jpg",
  ],
  wrong: [
    "/store-visit-photo-examples/wrong-1.jpg",
    "/store-visit-photo-examples/wrong-2.jpeg",
    "/store-visit-photo-examples/wrong-3.jpeg",
  ],
} as const;

type AppUser = {
  id: string;
  displayName: string;
};

type OfflineStoreOption = {
  id: string;
  name: string;
  city: string;
  province?: string | null;
  city_name?: string | null;
  district?: string | null;
  google_place_id?: string | null;
  channel_type: string;
  channel_id?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_accuracy_m?: number | null;
  location_captured_at?: string | null;
  external_store_id?: string | null;
  external_org_id?: string | null;
  external_org_name?: string | null;
  external_md_id?: string | null;
  external_md_name?: string | null;
  channels?: { id: string; code: string; name: string; type: string } | null;
};

type HistoryStoreOption = {
  store_id: string;
  name: string;
  city: string;
  province?: string | null;
  city_name?: string | null;
  district?: string | null;
  channel_type: string;
  channel_id?: string | null;
  address?: string | null;
  last_visit_at: string;
  visit_count: number;
  channels?: { id: string; code: string; name: string; type: string } | null;
};

type StoreLocationEvidence = {
  latitude: number;
  longitude: number;
  location_accuracy_m: number | null;
  location_captured_at: string;
};

type GoogleStoreOption = {
  google_place_id: string;
  name: string;
  city: string;
  province?: string | null;
  cityName?: string | null;
  district?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  distance_m?: number | null;
  primary_type?: string | null;
  local_store?: OfflineStoreOption | null;
};

type ReverseLocationResponse = {
  city?: string | null;
  province?: string | null;
  cityName?: string | null;
  district?: string | null;
  address?: string | null;
  error?: string;
};

type ExternalDealerOption = {
  userId: string;
  code: string;
  name: string;
  zoneId?: string | null;
  zoneName?: string | null;
};

type ExternalMdStoreOption = {
  code: string;
  name: string;
  zoneId?: string | null;
  zoneName?: string | null;
  dealerUserId: string;
  dealerName?: string | null;
};

type PendingImage = {
  file: File;
  preview: string;
};

type PendingImagesByCategory = Record<ImageCategory, PendingImage[]>;
type PendingImageUpload = PendingImage & { category: ImageCategory };
type PhotoSourceKind = "camera" | "album";

function emptyImagesByCategory(): PendingImagesByCategory {
  return {
    makuku_shelf: [],
    competitor_shelf: [],
    storefront: [],
  };
}

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatVisitDate(value: string, locale: Locale) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(time));
}

function formatStoreRegionText(store: {
  city?: string | null;
  province?: string | null;
  city_name?: string | null;
  district?: string | null;
} | null | undefined) {
  const parts = [store?.province, store?.city_name, store?.district].map((value) => String(value ?? "").trim()).filter(Boolean);
  if (parts.length > 0) return parts.join(" / ");
  return String(store?.city ?? "").trim();
}

function uiCopy(locale: Locale) {
  return locale === "zh"
    ? {
        selectStore: "\u9009\u62e9\u95e8\u5e97",
        selectStoreHint: "\u4f18\u5148\u9009\u62e9\u4f60\u8d70\u8bbf\u8fc7\u7684\u95e8\u5e97\uff0c\u6ca1\u6709\u5408\u9002\u7684\u518d\u53bb\u65b0\u589e\u3002",
        searchPlaceholder: "\u641c\u7d22\u95e8\u5e97\u540d\u3001\u5546\u573a\u3001\u57ce\u5e02",
        noStoreFound: "\u672a\u627e\u5230\u5339\u914d\u95e8\u5e97\uff0c\u53ef\u624b\u52a8\u65b0\u5efa",
        createStore: "\u65b0\u5efa\u95e8\u5e97",
        historySearchPlaceholder: "\u641c\u7d22\u4f60\u8d70\u8bbf\u8fc7\u7684\u95e8\u5e97",
        historyStoresLoading: "\u6b63\u5728\u52a0\u8f7d\u4f60\u7684\u5386\u53f2\u95e8\u5e97...",
        historyStoresError: "\u5386\u53f2\u95e8\u5e97\u52a0\u8f7d\u5931\u8d25\uff0c\u53ef\u76f4\u63a5\u53bb\u65b0\u589e\u3002",
        historyStoresEmpty: "\u8fd8\u6ca1\u6709\u5df2\u8d70\u8bbf\u7684\u95e8\u5e97\u3002",
        historyEntryAction: "\u65b0\u589e\u95e8\u5e97",
        recentVisit: "\u6700\u8fd1\u8d70\u8bbf",
        visitCountLabel: "\u8d70\u8bbf",
        visitCountUnit: "\u6b21",
        newStoreFlowTitle: "\u65b0\u589e\u95e8\u5e97",
        newStoreFlowHint: "\u53ea\u5728\u6ca1\u6709\u5408\u9002\u5386\u53f2\u95e8\u5e97\u65f6\uff0c\u518d\u7528 Google \u63a8\u8350\u6216\u624b\u52a8\u65b0\u5efa\u3002",
        locatingStores: "\u6b63\u5728\u83b7\u53d6\u9644\u8fd1\u95e8\u5e97...",
        nearbySorted: "\u5df2\u6309\u5f53\u524d\u4f4d\u7f6e\u6392\u5e8f",
        matchedSorted: "\u5df2\u5148\u6309\u5173\u952e\u8bcd\u5339\u914d\uff0c\u518d\u6309\u8ddd\u79bb\u6392\u5e8f",
        googleSearchFailed: "Google \u95e8\u5e97\u68c0\u7d22\u5931\u8d25\uff0c\u53ef\u76f4\u63a5\u624b\u52a8\u65b0\u5efa\u3002",
        googleMaterializeFailed: "\u65e0\u6cd5\u521b\u5efa\u5f53\u524d Google \u95e8\u5e97\uff0c\u8bf7\u91cd\u8bd5\u6216\u624b\u52a8\u65b0\u5efa\u3002",
        googleSearchEmpty: "\u6ca1\u6709\u627e\u5230\u53ef\u76f4\u63a5\u590d\u7528\u7684 Google \u95e8\u5e97\u3002",
        useCurrentLocation: "\u83b7\u53d6\u5b9a\u4f4d",
        choosingStore: "\u6b63\u5728\u751f\u6210\u95e8\u5e97...",
        confirmGoogleStoreTypeTitle: "\u8fd8\u5dee\u4e00\u6b65",
        confirmGoogleStoreTypeHint: "\u8bf7\u5148\u9009\u62e9\u4e09\u65b9 MD\uff0c\u518d\u9009\u62e9\u8be5 MD \u4e0b\u7684\u95e8\u5e97\u3002",
        confirmGoogleStoreTypeAction: "\u786e\u8ba4\u5e76\u7ee7\u7eed",
        selectDealerRequired: "\u9009\u62e9 MD *",
        selectExternalStoreRequired: "\u9009\u62e9\u95e8\u5e97 *",
        dealerSearchPlaceholder: "\u641c\u7d22 MD \u540d\u79f0\u6216\u7f16\u7801",
        externalStoreSearchPlaceholder: "\u641c\u7d22\u95e8\u5e97\u540d\u79f0\u6216\u7f16\u7801",
        externalDealerLoading: "\u6b63\u5728\u52a0\u8f7d MD...",
        externalStoreLoading: "\u6b63\u5728\u52a0\u8f7d\u95e8\u5e97...",
        externalDealerEmpty: "\u672a\u627e\u5230 MD\u3002",
        externalStoreEmpty: "\u672a\u627e\u5230\u8be5 MD \u4e0b\u7684\u95e8\u5e97\u3002",
        cityRequired: "\u7701 / \u5e02 / \u533a *",
        addressOptional: "\u5730\u5740\uff08\u9009\u586b\uff09",
        createFailed: "\u521b\u5efa\u95e8\u5e97\u5931\u8d25",
        createRequired: "\u8bf7\u5148\u9009\u62e9 MD\u3001\u95e8\u5e97\uff0c\u5e76\u586b\u5199\u7701 / \u5e02 / \u533a\u3002",
        selectedStore: "\u5df2\u9009\u95e8\u5e97",
        changeStore: "\u91cd\u65b0\u9009\u62e9\u95e8\u5e97",
        city: "\u7701 / \u5e02 / \u533a",
        channelType: "MD",
        address: "\u5730\u5740",
        creatingVisit: "\u6b63\u5728\u521b\u5efa\u5de1\u5e97...",
        processingPhotos: "\u6b63\u5728\u5904\u7406\u7167\u7247",
        analyzingPrices: "\u7167\u7247\u5df2\u4e0a\u4f20\uff0c\u6b63\u5728\u89e3\u6790\u4ef7\u683c...",
        submitted: "\u5df2\u63d0\u4ea4",
        storeInfoIncomplete: "\u95e8\u5e97\u4e3b\u6570\u636e\u4e0d\u5b8c\u6574\uff0c\u8bf7\u91cd\u65b0\u9009\u62e9\u6216\u65b0\u5efa\u95e8\u5e97\u3002",
        visitDate: "\u5de1\u5e97\u65e5\u671f",
        storeLocationGroup: "\u7701 / \u5e02 / \u533a\u4e0e\u8be6\u7ec6\u5730\u5740",
        storeLocationTitle: "\u95e8\u5e97\u5b9a\u4f4d",
        storeLocationHint: "\u4f7f\u7528\u6d4f\u89c8\u5668\u5b9a\u4f4d\uff0c\u5e76\u901a\u8fc7 LocationIQ \u81ea\u52a8\u586b\u5199\u7701 / \u5e02 / \u533a\u548c\u5730\u5740\u3002",
        locate: "\u5b9a\u4f4d\u5e76\u586b\u5199\u5730\u5740",
        locating: "\u5b9a\u4f4d\u4e2d...",
        located: "\u5df2\u5b9a\u4f4d\u5e76\u586b\u5199",
        locationUnavailable: "\u5f53\u524d\u65e0\u6cd5\u8c03\u7528\u5b9a\u4f4d\uff0c\u8bf7\u901a\u8fc7\u5df2\u5f00\u542f\u5b9a\u4f4d\u6743\u9650\u7684\u98de\u4e66 APP \u8fdb\u5165\u3002",
        locationFailed: "\u672a\u83b7\u5f97\u5b9a\u4f4d\u6743\u9650\uff0c\u8bf7\u5148\u5728\u98de\u4e66 APP \u7684\u5e94\u7528\u6743\u9650\u6216\u624b\u673a\u7cfb\u7edf\u8bbe\u7f6e\u4e2d\u5f00\u542f\u5b9a\u4f4d\u3002",
        entryLocationRequiredTitle: "\u8bf7\u5148\u5f00\u542f\u5b9a\u4f4d\u6743\u9650",
        entryLocationRequiredBody: "\u8bf7\u5728\u98de\u4e66 APP \u4e2d\u4e3a Makuku SFA \u5f00\u542f\u5b9a\u4f4d\u6743\u9650\uff0c\u540c\u65f6\u786e\u8ba4\u624b\u673a\u7cfb\u7edf\u5b9a\u4f4d\u5df2\u6253\u5f00\uff0c\u5426\u5219\u65e0\u6cd5\u8fdb\u5165\u672c H5\u3002",
        entryLocationRetry: "\u5df2\u5f00\u542f\uff0c\u91cd\u8bd5",
        entryLocationChecking: "\u6b63\u5728\u9a8c\u8bc1\u5b9a\u4f4d\u6743\u9650...",
        entryLocationUnsupported: "\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u5b9a\u4f4d\uff0c\u8bf7\u4ece\u5df2\u5f00\u542f\u5b9a\u4f4d\u6743\u9650\u7684\u98de\u4e66 APP \u91cd\u65b0\u8fdb\u5165\u3002",
        entryLocationDenied: "\u672a\u83b7\u5f97\u5b9a\u4f4d\u6743\u9650\uff0c\u8bf7\u5728\u98de\u4e66 APP \u7684\u5e94\u7528\u6743\u9650\u6216\u624b\u673a\u7cfb\u7edf\u8bbe\u7f6e\u4e2d\u5f00\u542f\u5b9a\u4f4d\u540e\u91cd\u8bd5\u3002",
        reverseAddressFailed: "\u5730\u5740\u8bc6\u522b\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u586b\u5199\u7701 / \u5e02 / \u533a\u548c\u5730\u5740\u3002",
        reverseAddressMissing: "\u5df2\u4fdd\u5b58\u7ecf\u7eac\u5ea6\uff0c\u4f46\u672a\u8bc6\u522b\u51fa\u7701 / \u5e02 / \u533a\u6216\u5730\u5740\uff0c\u8bf7\u624b\u52a8\u586b\u5199\u3002",
        locationAttribution: "Address by LocationIQ",
        signInTitle: "\u8bf7\u5148\u767b\u5f55",
        signInBody: "\u65b0\u589e\u5de1\u5e97\u9700\u8981\u7ed1\u5b9a\u5de1\u5e97\u8d26\u53f7\uff0c\u767b\u5f55\u540e\u4f1a\u81ea\u52a8\u5e26\u51fa\u63d0\u4ea4\u4eba\u3002",
        takePhoto: "\u62cd\u7167\u4e0a\u4f20",
        chooseFromAlbum: "\u4ece\u76f8\u518c\u9009\u62e9",
        photoExample: "\u62cd\u7167\u7528\u4f8b",
        photoExampleTitle: "\u4ef7\u683c\u6807\u7b7e\u62cd\u7167\u7528\u4f8b",
        photoExampleGood: "\u5408\u683c\uff1a\u6b63\u5bf9\u4ef7\u683c\u6807\u7b7e\u62cd\uff0c\u9760\u8fd1\u8d27\u67b6\uff0c\u4e00\u5f20\u56fe\u53ea\u62cd\u4e00\u4e2a\u5c0f\u8d27\u67b6\u533a\u57df\uff0c\u4ef7\u683c\u6570\u5b57\u6e05\u695a\u65e0\u906e\u6321\uff0c\u5546\u54c1\u548c\u4ef7\u683c\u6807\u7b7e\u80fd\u5bf9\u5e94\u3002",
        photoExampleBad: "\u4e0d\u5408\u683c\uff1a\u4e0d\u8981\u6cbf\u8d27\u67b6\u659c\u62cd\u6574\u6392\uff1b\u5982\u679c\u8fdc\u7aef\u4ef7\u7b7e\u56e0\u900f\u89c6\u53d8\u5c0f\u770b\u4e0d\u6e05\uff0c\u8bf7\u9760\u8fd1\u5206\u591a\u5f20\u62cd\u3002",
        photoExampleCorrectTitle: "\u5408\u683c\u793a\u4f8b",
        photoExampleWrongTitle: "\u4e0d\u5408\u683c\u793a\u4f8b",
        photoExampleCorrectCaptions: ["\u6b63\u5bf9\u62cd", "\u6570\u5b57\u6e05\u6670", "\u4e00\u5f20\u4e00\u5c0f\u533a\u57df"],
        photoExampleWrongCaptions: ["\u659c\u62cd\u8fc7\u5f3a", "\u4ef7\u683c\u4e0d\u6e05\u695a", "\u4ef7\u683c\u88ab\u906e\u6321"],

        cancel: "\u53d6\u6d88",
        choosingPhotoSource: "\u6b63\u5728\u6253\u5f00",
        cameraPermissionHint: "\u672a\u80fd\u8c03\u8d77\u76f8\u673a\u6216\u6ca1\u6709\u9009\u4e2d\u7167\u7247\u3002\u8bf7\u5141\u8bb8\u76f8\u673a\u6743\u9650\uff0c\u6216\u6539\u7528\u201c\u4ece\u76f8\u518c\u9009\u62e9\u201d\u3002",
        albumSelectionHint: "\u672a\u9009\u4e2d\u4efb\u4f55\u7167\u7247\uff0c\u53ef\u91cd\u65b0\u4ece\u76f8\u518c\u9009\u62e9\u3002",
      }
    : {
        selectStore: "Select Store",
        selectStoreHint: "Start with stores this user has already visited. Only add a new store when none of them fit.",
        searchPlaceholder: "Search store name, mall, or city",
        noStoreFound: "No matching store found. Create one manually.",
        createStore: "Create Store",
        historySearchPlaceholder: "Search your visited stores",
        historyStoresLoading: "Loading your visited stores...",
        historyStoresError: "Visited-store history could not be loaded. You can add a new store instead.",
        historyStoresEmpty: "No visited stores yet.",
        historyEntryAction: "Add Store",
        recentVisit: "Recent visit",
        visitCountLabel: "Visits",
        visitCountUnit: "",
        newStoreFlowTitle: "Add New Store",
        newStoreFlowHint: "Use Google suggestions or manual creation only when no visited store fits.",
        locatingStores: "Loading nearby stores...",
        nearbySorted: "Sorted by current location",
        matchedSorted: "Matched by keyword, then sorted by distance",
        googleSearchFailed: "Google store search failed. You can create the store manually.",
        googleMaterializeFailed: "Unable to create the selected Google store. Try again or create it manually.",
        googleSearchEmpty: "No reliable Google store match was found.",
        useCurrentLocation: "Get location",
        choosingStore: "Creating store...",
        confirmGoogleStoreTypeTitle: "One more step",
        confirmGoogleStoreTypeHint: "Select the external MD first, then choose the store under that MD.",
        confirmGoogleStoreTypeAction: "Confirm and continue",
        selectDealerRequired: "Select MD *",
        selectExternalStoreRequired: "Select Store *",
        dealerSearchPlaceholder: "Search MD name or code",
        externalStoreSearchPlaceholder: "Search store name or code",
        externalDealerLoading: "Loading MDs...",
        externalStoreLoading: "Loading stores...",
        externalDealerEmpty: "No MD found.",
        externalStoreEmpty: "No store found under this MD.",
        cityRequired: "Province / City / District *",
        addressOptional: "Address (optional)",
        createFailed: "Failed to create store",
        createRequired: "Select the MD, select the store, and enter province / city / district.",
        selectedStore: "Selected Store",
        changeStore: "Change Store",
        city: "Province / City / District",
        channelType: "MD",
        address: "Address",
        creatingVisit: "Creating store visit...",
        processingPhotos: "Processing",
        analyzingPrices: "Photos uploaded. Parsing price tags only...",
        submitted: "Submitted.",
        storeInfoIncomplete: "Store master data is incomplete. Select or create another store.",
        visitDate: "Visit Date",
        storeLocationGroup: "Province / City / District and Address",
        storeLocationTitle: "Store Location",
        storeLocationHint: "Uses free browser location, then LocationIQ fills province / city / district and address.",
        locate: "Locate & Fill Address",
        locating: "Locating...",
        located: "Located and filled",
        locationUnavailable: "Location is unavailable here. Re-enter from the Feishu app with location permission enabled.",
        locationFailed: "Location permission was not granted. Enable it in Feishu app permissions or system settings first.",
        entryLocationRequiredTitle: "Enable Location First",
        entryLocationRequiredBody: "Enable location permission for Makuku SFA inside the Feishu app, and make sure device location is turned on, otherwise this H5 cannot be entered.",
        entryLocationRetry: "Retry After Enabling",
        entryLocationChecking: "Checking location permission...",
        entryLocationUnsupported: "This environment does not support location. Re-enter from the Feishu app with location enabled.",
        entryLocationDenied: "Location permission was not granted. Enable it in Feishu app permissions or system settings and try again.",
        reverseAddressFailed: "Address lookup failed. Fill province / city / district and address manually.",
        reverseAddressMissing: "Coordinates were saved, but province / city / district or address was not found. Fill manually.",
        locationAttribution: "Address by LocationIQ",
        signInTitle: "Sign In Required",
        signInBody: "New visits must be tied to a field user. Sign in first and the promoter is filled automatically.",
        takePhoto: "Take Photo",
        chooseFromAlbum: "Choose from Album",
        photoExample: "Photo Example",
        photoExampleTitle: "Price-tag Photo Example",
        photoExampleGood: "Good: Retake directly facing the price tags, close to the shelf, one small shelf area per photo, clear unobstructed price digits, and product-price pairs visible.",
        photoExampleBad: "Invalid: do not shoot a whole shelf row from the side. If far price tags become too small from perspective, move closer and take multiple photos.",
        photoExampleCorrectTitle: "Correct Examples",
        photoExampleWrongTitle: "Wrong Examples",
        photoExampleCorrectCaptions: ["Front-facing", "Clear digits", "One shelf section"],
        photoExampleWrongCaptions: ["Too angled", "Price not clear", "Blocked price"],
        cancel: "Cancel",
        choosingPhotoSource: "Opening",
        cameraPermissionHint: "Camera did not return a photo. Allow camera access, or use Choose from Album instead.",
        albumSelectionHint: "No photo was selected. Try Choose from Album again.",
      };
}

function channelLabel(value: string | null | undefined, store?: OfflineStoreOption | null) {
  if (store?.channels?.name) return store.channels.name;
  switch (value) {
    case "modern_trade":
      return "Modern Trade";
    case "baby_store":
      return "Baby Store";
    case "pharmacy":
      return "Pharmacy";
    case "general_trade":
      return "General Trade";
    case "other":
      return "Other";
    default:
      return value || "-";
  }
}

function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatDistance(distanceM: number | null | undefined) {
  if (!Number.isFinite(distanceM ?? NaN)) return null;
  if ((distanceM ?? 0) < 1000) return `${Math.round(distanceM ?? 0)}m`;
  return `${((distanceM ?? 0) / 1000).toFixed(1)}km`;
}

function loadUser() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    return null;
  }
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debounced;
}

function DealerStoreSelector({
  locale,
  loading,
  onAuthFailure,
  onSelectionChange,
}: {
  locale: Locale;
  loading?: boolean;
  onAuthFailure?: (response: Response, message?: string | null) => boolean;
  onSelectionChange: (selection: { selectedDealer: ExternalDealerOption | null; selectedExternalStore: ExternalMdStoreOption | null }) => void;
}) {
  const labels = uiCopy(locale);
  const [dealerQuery, setDealerQuery] = useState("");
  const [dealersLoading, setDealersLoading] = useState(false);
  const [dealers, setDealers] = useState<ExternalDealerOption[]>([]);
  const [selectedDealer, setSelectedDealer] = useState<ExternalDealerOption | null>(null);
  const [dealerPickerOpen, setDealerPickerOpen] = useState(false);
  const [storeQuery, setStoreQuery] = useState("");
  const [storesLoading, setStoresLoading] = useState(false);
  const [stores, setStores] = useState<ExternalMdStoreOption[]>([]);
  const [selectedExternalStore, setSelectedExternalStore] = useState<ExternalMdStoreOption | null>(null);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [status, setStatus] = useState("");
  const debouncedDealerQuery = useDebouncedValue(dealerQuery, 300);
  const debouncedStoreQuery = useDebouncedValue(storeQuery, 300);
  const dealerSearchKey = dealerPickerOpen ? debouncedDealerQuery.trim() : "";
  const storeSearchKey = selectedDealer && storePickerOpen ? debouncedStoreQuery.trim() : "";
  const showDealerResults = dealerPickerOpen;
  const showStoreResults = selectedDealer !== null && storePickerOpen;
  const visibleDealers = dealerPickerOpen ? dealers : [];
  const visibleStores = selectedDealer && storePickerOpen ? stores : [];

  useEffect(() => {
    onSelectionChange({ selectedDealer, selectedExternalStore });
  }, [onSelectionChange, selectedDealer, selectedExternalStore]);

  useEffect(() => {
    if (!dealerPickerOpen) {
      return;
    }

    let cancelled = false;
    async function loadDealers() {
      setDealersLoading(true);
      setStatus("");
      try {
        const params = new URLSearchParams({ pageNo: "1", pageSize: "10" });
        if (dealerSearchKey) params.set("q", dealerSearchKey);
        const res = await fetch(`/api/external-md/dealers?${params.toString()}`);
        const payload = (await res.json().catch(() => ({}))) as {
          data?: { records?: ExternalDealerOption[] };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          if (onAuthFailure?.(res, typeof payload.error === "string" ? payload.error : null)) return;
          setDealers([]);
          setStatus(payload.error ?? labels.createFailed);
          return;
        }
        const items = payload.data?.records ?? [];
        setDealers(items);
        setSelectedDealer((current) => items.find((item) => item.userId === current?.userId) ?? (current && items.length === 0 ? current : null));
      } catch {
        if (!cancelled) {
          setDealers([]);
          setStatus(labels.createFailed);
        }
      } finally {
        if (!cancelled) setDealersLoading(false);
      }
    }
    void loadDealers();
    return () => {
      cancelled = true;
    };
  }, [dealerPickerOpen, dealerSearchKey, labels.createFailed, onAuthFailure]);

  useEffect(() => {
    if (!selectedDealer || !storePickerOpen) {
      return;
    }
    const currentDealer = selectedDealer;

    let cancelled = false;
    async function loadStores() {
      setStoresLoading(true);
      setStatus("");
      try {
        const params = new URLSearchParams({
          dealerUserId: currentDealer.userId,
          pageNo: "1",
          pageSize: "10",
        });
        if (storeSearchKey) params.set("q", storeSearchKey);
        const res = await fetch(`/api/external-md/stores?${params.toString()}`);
        const payload = (await res.json().catch(() => ({}))) as {
          data?: { records?: ExternalMdStoreOption[] };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          if (onAuthFailure?.(res, typeof payload.error === "string" ? payload.error : null)) return;
          setStores([]);
          setStatus(payload.error ?? labels.createFailed);
          return;
        }
        setStores(payload.data?.records ?? []);
      } catch {
        if (!cancelled) {
          setStores([]);
          setStatus(labels.createFailed);
        }
      } finally {
        if (!cancelled) setStoresLoading(false);
      }
    }
    void loadStores();
    return () => {
      cancelled = true;
    };
  }, [labels.createFailed, onAuthFailure, selectedDealer, storePickerOpen, storeSearchKey]);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-slate-600">{labels.selectDealerRequired}</span>
        <input
          value={dealerQuery}
          onChange={(event) => setDealerQuery(event.target.value)}
          onFocus={() => setDealerPickerOpen(true)}
          placeholder={labels.dealerSearchPlaceholder}
          disabled={loading}
          className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500"
        />
      </label>
      {showDealerResults ? (
        <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
          {dealersLoading ? <div className="px-2 py-3 text-sm text-slate-500">{labels.externalDealerLoading}</div> : null}
          {!dealersLoading && visibleDealers.length === 0 ? <div className="px-2 py-3 text-sm text-slate-500">{labels.externalDealerEmpty}</div> : null}
          {visibleDealers.map((dealer) => (
            <button
              key={dealer.userId}
              type="button"
              onClick={() => {
                setSelectedDealer(dealer);
                setSelectedExternalStore(null);
                setStores([]);
                setStoreQuery("");
                setDealerQuery(dealer.name);
                setDealerPickerOpen(false);
              }}
              disabled={loading}
              className={`w-full rounded-lg border px-3 py-2 text-left ${selectedDealer?.userId === dealer.userId ? "border-slate-900 bg-white" : "border-slate-200 bg-white"}`}
            >
              <div className="text-sm font-semibold text-slate-900">{dealer.name}</div>
              <div className="mt-1 text-xs text-slate-500">{dealer.code || dealer.userId}</div>
            </button>
          ))}
        </div>
      ) : null}
      {selectedDealer && !showDealerResults ? (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <div>{selectedDealer.name}</div>
          <div className="mt-1 text-xs text-slate-500">{selectedDealer.code || selectedDealer.userId}</div>
        </div>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-slate-600">{labels.selectExternalStoreRequired}</span>
        <input
          value={storeQuery}
          onChange={(event) => setStoreQuery(event.target.value)}
          onFocus={() => {
            if (!selectedDealer) return;
            setStorePickerOpen(true);
          }}
          placeholder={labels.externalStoreSearchPlaceholder}
          disabled={!selectedDealer || loading}
          className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
        />
      </label>
      {showStoreResults ? (
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
          {!selectedDealer ? <div className="px-2 py-3 text-sm text-slate-500">{labels.selectDealerRequired}</div> : null}
          {selectedDealer && storesLoading ? <div className="px-2 py-3 text-sm text-slate-500">{labels.externalStoreLoading}</div> : null}
          {selectedDealer && !storesLoading && visibleStores.length === 0 ? <div className="px-2 py-3 text-sm text-slate-500">{labels.externalStoreEmpty}</div> : null}
          {visibleStores.map((store) => (
            <button
              key={store.code}
              type="button"
              onClick={() => {
                setSelectedExternalStore(store);
                setStoreQuery(store.name);
                setStorePickerOpen(false);
              }}
              disabled={loading}
              className={`w-full rounded-lg border px-3 py-2 text-left ${selectedExternalStore?.code === store.code ? "border-slate-900 bg-white" : "border-slate-200 bg-white"}`}
            >
              <div className="text-sm font-semibold text-slate-900">{store.name}</div>
              <div className="mt-1 text-xs text-slate-500">{store.code}</div>
              <div className="mt-1 text-[11px] text-slate-400">{store.zoneName ?? selectedDealer?.zoneName ?? "-"}</div>
            </button>
          ))}
        </div>
      ) : null}
      {selectedExternalStore && !showStoreResults ? (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <div>{selectedExternalStore.name}</div>
          <div className="mt-1 text-xs text-slate-500">{selectedDealer?.name ?? selectedExternalStore.dealerName ?? "-"}</div>
        </div>
      ) : null}
      {status ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{status}</div> : null}
    </div>
  );
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read image"));
    };
    image.src = url;
  });
}

async function prepareImageForUpload(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} is not an image.`);
  }
  if (file.size <= maxUploadBytes) return file;

  const image = await loadImage(file);
  const scale = Math.min(1, compressionMaxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image compression is not available in this browser.");
  ctx.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", compressionQuality);
  });
  if (!blob) throw new Error("Image compression failed.");

  const safeName = file.name.replace(/\.[^.]+$/, "") || "store-photo";
  const compressed = new File([blob], `${safeName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
  return compressed;
}

async function uploadVisitImage({
  visitId,
  image,
  index,
  submitFailed,
}: {
  visitId: string;
  image: PendingImageUpload;
  index: number;
  submitFailed: string;
}) {
  const file = await prepareImageForUpload(image.file);
  if (file.size > maxUploadBytes) {
    throw new Error(`Photo ${index + 1} is still ${formatMb(file.size)} after compression. Please choose a smaller photo.`);
  }

  const imageFormData = new FormData();
  imageFormData.set("image", file);
  imageFormData.set("image_category", image.category);
  const imageRes = await fetch(`/api/store-visit/${visitId}/images`, {
    method: "POST",
    body: imageFormData,
  });
  const imageData = await imageRes.json().catch(() => ({}));
  if (!imageRes.ok) {
    throw new Error(`Photo ${index + 1} upload failed: ${imageData.error ?? submitFailed}`);
  }
}

async function uploadImagesWithConcurrency({
  visitId,
  images,
  concurrency,
  submitFailed,
  onProgress,
}: {
  visitId: string;
  images: PendingImageUpload[];
  concurrency: number;
  submitFailed: string;
  onProgress: (completedCount: number) => void;
}) {
  let nextIndex = 0;
  let completedCount = 0;
  let stopped = false;

  async function worker() {
    while (!stopped) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= images.length) return;

      try {
        await uploadVisitImage({ visitId, image: images[index], index, submitFailed });
        completedCount += 1;
        onProgress(completedCount);
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), images.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

export function StoreVisitH5({ locale }: { locale: Locale }) {
  const router = useRouter();
  const copy = getMobileCopy(locale);
  const labels = uiCopy(locale);
  const priceTagRequiredText = locale === "zh" ? "请至少上传一张价格标签照片。" : "Please upload at least one price-tag photo.";
  const [visitDate, setVisitDate] = useState(localDateInputValue);
  const [user, setUser] = useState<AppUser | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [selectedStore, setSelectedStore] = useState<OfflineStoreOption | null>(null);
  const [images, setImages] = useState<PendingImagesByCategory>(() => emptyImagesByCategory());
  const [submitting, setSubmitting] = useState(false);
  const [redirectingToList, setRedirectingToList] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [photoSourceSheet, setPhotoSourceSheet] = useState<ImageCategory | null>(null);
  const [photoExampleSheet, setPhotoExampleSheet] = useState<ImageCategory | null>(null);
  const [activePhotoCategory, setActivePhotoCategory] = useState<ImageCategory | null>(null);
  const [pendingPhotoSelection, setPendingPhotoSelection] = useState<PhotoSourceKind | null>(null);
  const [sourceStatus, setSourceStatus] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const albumInputRef = useRef<HTMLInputElement | null>(null);
  const photoPickerTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      async function syncUserSession() {
        const stored = loadUser();
        if (!stored?.id) {
          if (!cancelled) {
            setUser(null);
            setUserLoaded(true);
          }
          return;
        }

        try {
          const response = await fetch("/api/auth/session", { cache: "no-store" });
          const payload = await response.json().catch(() => ({}));
          if (!cancelled) {
            if (payload.user?.id) {
              setUser(stored);
            } else {
              localStorage.removeItem(storageKey);
              setUser(null);
            }
            setUserLoaded(true);
          }
        } catch {
          if (!cancelled) {
            localStorage.removeItem(storageKey);
            setUser(null);
            setUserLoaded(true);
          }
        }
      }

      void syncUserSession();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  const totalImageCount = imageCategoryOrder.reduce((sum, category) => sum + images[category].length, 0);
  const storeInfoIncomplete = Boolean(selectedStore && (!formatStoreRegionText(selectedStore) || !selectedStore.channel_type?.trim()));

  function handleAuthFailure(response: Response, message?: string | null) {
    if (response.status !== 401) return false;
    localStorage.removeItem(storageKey);
    setUser(null);
    setSelectedStore(null);
    setError(message?.trim() || copy.signInFirst);
    return true;
  }

  function addFiles(category: ImageCategory, files: FileList | null) {
    if (!files) return;
    const nextFiles = Array.from(files).slice(0, maxImages - totalImageCount);
    setImages((current) => ({
      ...current,
      [category]: [...current[category], ...nextFiles.map((file) => ({ file, preview: URL.createObjectURL(file) }))],
    }));
  }

  function removeImage(category: ImageCategory, index: number) {
    setImages((current) => ({
      ...current,
      [category]: current[category].filter((_, i) => i !== index),
    }));
  }

  function showPhotoSourceSheet(category: ImageCategory) {
    if (totalImageCount >= maxImages) return;
    setSourceStatus(null);
    setActivePhotoCategory(category);
    setPhotoSourceSheet(category);
  }

  function closePhotoSourceSheet() {
    setPhotoSourceSheet(null);
  }

  function clearPhotoPickerTimeout() {
    if (photoPickerTimeoutRef.current !== null) {
      window.clearTimeout(photoPickerTimeoutRef.current);
      photoPickerTimeoutRef.current = null;
    }
  }

  function handleSourcePickerCancel(source: PhotoSourceKind) {
    setPendingPhotoSelection(null);
    setSourceStatus(source === "camera" ? labels.cameraPermissionHint : labels.albumSelectionHint);
  }

  function beginPhotoSelection(source: PhotoSourceKind) {
    const input = source === "camera" ? cameraInputRef.current : albumInputRef.current;
    if (!input) return;
    clearPhotoPickerTimeout();
    setPendingPhotoSelection(source);
    setSourceStatus(`${labels.choosingPhotoSource} ${source === "camera" ? labels.takePhoto : labels.chooseFromAlbum}...`);
    closePhotoSourceSheet();
    input.click();
    photoPickerTimeoutRef.current = window.setTimeout(() => {
      handleSourcePickerCancel(source);
    }, 1200);
  }

  function handleSourceFiles(files: FileList | null) {
    clearPhotoPickerTimeout();
    const source = pendingPhotoSelection;
    setPendingPhotoSelection(null);
    if (!activePhotoCategory) return;
    if (!files || files.length === 0) {
      if (source) handleSourcePickerCancel(source);
      return;
    }
    addFiles(activePhotoCategory, files);
    setActivePhotoCategory(null);
    setSourceStatus(null);
    closePhotoSourceSheet();
  }

  useEffect(() => () => clearPhotoPickerTimeout(), []);

  async function submit() {
    if (!user?.id) {
      setError(copy.signInFirst);
      return;
    }
    if (!selectedStore) {
      setError(labels.selectStoreHint);
      return;
    }
    if (storeInfoIncomplete) {
      setError(labels.storeInfoIncomplete);
      return;
    }
    if (!visitDate) {
      setError(copy.completeStoreInfo);
      return;
    }
    if (images.makuku_shelf.length === 0 && images.competitor_shelf.length === 0) {
      setError(priceTagRequiredText);
      return;
    }

    const flattenedImages = imageCategoryOrder.flatMap((category) => images[category].map((image) => ({ ...image, category })));
    if (flattenedImages.length > maxImages) {
      setError(`Upload up to ${maxImages} images.`);
      return;
    }

    setSubmitting(true);
    setSubmitStatus(`${labels.processingPhotos} 0/${flattenedImages.length}`);
    setError(null);

    try {
      setSubmitStatus(labels.creatingVisit);
      const res = await fetch("/api/store-visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: selectedStore.id,
          store_name: selectedStore.name,
          city: formatStoreRegionText(selectedStore),
          region: formatStoreRegionText(selectedStore),
          channel_type: selectedStore.channel_type,
          channel: selectedStore.channel_type,
          channel_id: selectedStore.channel_id ?? selectedStore.channels?.id ?? null,
          visit_date: visitDate,
          promoter: user?.displayName ?? "",
          user_id: user.id,
          uploader_user_id: user.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (handleAuthFailure(res, typeof data.error === "string" ? data.error : null)) return;
        setError(data.error ?? copy.submitFailed);
        return;
      }
      const visitId = String(data.visit?.id ?? "");
      if (!visitId) throw new Error("Store visit was created without an id.");

      setSubmitStatus(`${labels.processingPhotos} 0/${flattenedImages.length}`);
      await uploadImagesWithConcurrency({
        visitId,
        images: flattenedImages,
        concurrency: uploadConcurrency,
        submitFailed: copy.submitFailed,
        onProgress: (completedCount) => setSubmitStatus(`${labels.processingPhotos} ${completedCount}/${flattenedImages.length}`),
      });

      setSubmitStatus(labels.submitted);
      setRedirectingToList(true);
      router.replace(`/${locale}/mobile/offline-capture`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.networkRetry);
    } finally {
      setSubmitting(false);
      setSubmitStatus("");
    }
  }

  if (!userLoaded) {
    return (
      <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-4 py-5 text-slate-950">
        <header className="mb-4 flex items-center gap-3">
          <div className="mt-1 h-10 w-10 animate-pulse rounded-full bg-slate-200" />
          <div className="min-w-0 flex-1">
            <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-7 w-44 animate-pulse rounded bg-slate-100" />
          </div>
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
          <div className="mt-4 h-11 animate-pulse rounded-lg bg-slate-100" />
          <div className="mt-3 h-11 animate-pulse rounded-lg bg-slate-100" />
          <div className="mt-4 h-40 animate-pulse rounded-xl bg-slate-100" />
        </section>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500 shadow-sm">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          {locale === "zh" ? "正在加载巡店表单..." : "Loading the visit form..."}
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-4 py-5 text-slate-950">
        <header className="mb-5 flex items-start gap-3">
          <Link href={`/${locale}/mobile/offline-capture`} className="mt-1 rounded-full border border-slate-200 bg-white p-2 text-slate-700">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-normal text-blue-600">{copy.aiStoreVisit}</p>
          <h1 className="mt-2 text-2xl font-bold">{labels.signInTitle}</h1>
          <p className="mt-1 text-sm text-slate-500">{labels.signInBody}</p>
        </div>
      </header>
        <Link href={`/${locale}/mobile/offline-capture`} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white">
          <LogIn className="h-4 w-4" />
          {copy.goToCapture}
        </Link>
      </main>
    );
  }

  return (
    <>
      <LoadingOverlay
        open={redirectingToList}
        title={locale === "zh" ? "提交成功，正在返回巡店列表..." : "Submitted. Returning to the visit list..."}
        description={locale === "zh" ? "请稍候，不要重复点击。" : "Please wait and avoid tapping repeatedly."}
      />
      <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-4 py-5 text-slate-950">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            handleSourceFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={albumInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            handleSourceFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <header className="mb-4 flex items-center gap-3">
          <Link href={`/${locale}/mobile/offline-capture`} className="mt-1 rounded-full border border-slate-200 bg-white p-2 text-slate-700">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-normal text-blue-600">{copy.aiStoreVisit}</p>
          </div>
        </header>

        {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {sourceStatus ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{sourceStatus}</div> : null}
        {submitStatus ? <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{submitStatus}</div> : null}

        {!selectedStore ? (
          <StoreSearchStep locale={locale} user={user} onAuthFailure={handleAuthFailure} onSelect={(store) => { setSelectedStore(store); setError(null); }} />
        ) : (
          <>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">{labels.selectedStore}</div>
                <h2 className="mt-1 break-words text-lg font-bold">{selectedStore.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStore(null)}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                {labels.changeStore}
              </button>
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              <ReadOnlyRow label={labels.city} value={formatStoreRegionText(selectedStore) || "-"} />
              <ReadOnlyRow label={labels.channelType} value={channelLabel(selectedStore.channel_type, selectedStore)} />
              <ReadOnlyRow label={labels.address} value={selectedStore.address || "-"} />
            </div>
            {storeInfoIncomplete ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{labels.storeInfoIncomplete}</div> : null}
          </section>

          <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
            <span className="shrink-0 font-semibold text-slate-600">{labels.visitDate}</span>
            <input type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-right text-sm outline-none focus:border-blue-500" />
          </label>

          <section className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="font-semibold">{copy.shelfPhotos}</h2>
                <button
                  type="button"
                  onClick={() => setPhotoExampleSheet("makuku_shelf")}
                  className="inline-flex h-5 items-center rounded-full bg-red-50 px-2 text-[10px] font-semibold leading-none tracking-normal text-red-700 ring-1 ring-inset ring-red-200 shadow-sm shadow-red-100/60"
                >
                  {labels.photoExample}
                </button>
              </div>
              <div>
                <p className="mt-1 text-xs text-slate-500">{totalImageCount}/{maxImages} {copy.uploaded}</p>
              </div>
            </div>

            {imageCategoryOrder.map((category) => (
              <ImageUploadSection
                key={category}
                title={mobileImageCategoryLabel(locale, category)}
                required={false}
                addLabel={copy.add}
                uploadedLabel={copy.uploaded}
                emptyText={copy.noPhotosYet}
                images={images[category]}
                disabled={totalImageCount >= maxImages || pendingPhotoSelection !== null}
                onOpenSourceSheet={() => showPhotoSourceSheet(category)}
                onRemove={(index) => removeImage(category, index)}
              />
            ))}
          </section>

          <button type="button" onClick={submit} disabled={submitting || redirectingToList || storeInfoIncomplete} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-60">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? (submitStatus || copy.submitting) : copy.submitStoreVisit}
          </button>
          </>
        )}
      </main>
      {photoSourceSheet ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40" role="dialog" aria-modal="true" onClick={closePhotoSourceSheet}>
          <div className="mx-auto w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => beginPhotoSelection("camera")}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900"
              >
                <Camera className="h-4 w-4" />
                {labels.takePhoto}
              </button>
              <button
                type="button"
                onClick={() => beginPhotoSelection("album")}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900"
              >
                <Plus className="h-4 w-4" />
                {labels.chooseFromAlbum}
              </button>
              <button
                type="button"
                onClick={closePhotoSourceSheet}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white"
              >
                {labels.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {photoExampleSheet ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40" role="dialog" aria-modal="true" onClick={() => setPhotoExampleSheet(null)}>
          <div className="mx-auto flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pb-4 pt-5">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-950">{labels.photoExampleTitle}</h2>
                <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{labels.photoExampleGood}</p>
              </div>
              <button type="button" onClick={() => setPhotoExampleSheet(null)} className="rounded-full p-1 text-slate-500" aria-label={labels.cancel}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-sm font-semibold text-emerald-700">{labels.photoExampleCorrectTitle}</div>
                <div className="grid grid-cols-2 gap-3">
                  {photoExampleImages.correct.map((src, index) => (
                    <div key={src} className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`${labels.photoExampleCorrectTitle} ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
                      <div className="px-2.5 py-2 text-center text-[11px] font-semibold text-emerald-800">
                        {labels.photoExampleCorrectCaptions?.[index] ?? labels.photoExampleCorrectTitle}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold text-amber-700">{labels.photoExampleWrongTitle}</div>
                <div className="mb-2 text-xs leading-5 text-slate-500">{labels.photoExampleBad}</div>
                <div className="grid grid-cols-2 gap-3">
                  {photoExampleImages.wrong.map((src, index) => (
                    <div key={src} className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`${labels.photoExampleWrongTitle} ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
                      <div className="px-2.5 py-2 text-center text-[11px] font-semibold text-amber-800">
                        {labels.photoExampleWrongCaptions?.[index] ?? labels.photoExampleWrongTitle}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </div>
            <button
              type="button"
              onClick={() => setPhotoExampleSheet(null)}
              className="mx-5 mb-5 mt-4 flex h-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white"
            >
              {labels.cancel}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function StoreSearchStep({
  locale,
  user,
  onAuthFailure,
  onSelect,
}: {
  locale: Locale;
  user: AppUser;
  onAuthFailure: (response: Response, message?: string | null) => boolean;
  onSelect: (store: OfflineStoreOption) => void;
}) {
  const labels = uiCopy(locale);
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"history" | "new_store">("history");
  const [historyStores, setHistoryStores] = useState<HistoryStoreOption[]>([]);
  const [historyStoresLoading, setHistoryStoresLoading] = useState(true);
  const [historyStoresError, setHistoryStoresError] = useState<string | null>(null);
  const debouncedHistoryQuery = useDebouncedValue(query, 400);
  const historyResults = historyStores;
  const historyStoresEmpty = !historyStoresLoading && historyResults.length === 0;

  function toOfflineStoreOption(store: HistoryStoreOption): OfflineStoreOption {
    return {
      id: store.store_id,
      name: store.name,
      city: store.city,
      province: store.province ?? null,
      city_name: store.city_name ?? null,
      district: store.district ?? null,
      channel_type: store.channel_type,
      channel_id: store.channel_id ?? null,
      address: store.address ?? null,
      channels: store.channels ?? null,
    };
  }

  const loadHistoryStores = useCallback(async (keyword: string) => {
    setHistoryStoresLoading(true);
    setHistoryStoresError(null);
    try {
      const params = new URLSearchParams();
      params.set("user_id", user.id);
      params.set("limit", "20");
      if (keyword.trim()) params.set("q", keyword.trim());
      const res = await fetch(`/api/store-visit-history-stores?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (onAuthFailure(res, typeof data.error === "string" ? data.error : null)) return;
        setHistoryStores([]);
        setHistoryStoresError(data.error ?? labels.historyStoresError);
        return;
      }
      setHistoryStores((data.stores ?? []) as HistoryStoreOption[]);
    } catch {
      setHistoryStores([]);
      setHistoryStoresError(labels.historyStoresError);
    } finally {
      setHistoryStoresLoading(false);
    }
  }, [labels.historyStoresError, onAuthFailure, user.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled && searchMode === "history") {
        await loadHistoryStores(debouncedHistoryQuery);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedHistoryQuery, loadHistoryStores, searchMode]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="font-semibold">{searchMode === "history" ? labels.selectStore : labels.createStore}</h2>
        <p className="mt-1 text-xs text-slate-500">{searchMode === "history" ? labels.selectStoreHint : labels.newStoreFlowHint}</p>
      </div>
      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchMode === "history" ? labels.historySearchPlaceholder : labels.searchPlaceholder}
          className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500"
        />
        {historyStoresLoading && searchMode === "history" ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" /> : null}
      </div>

      {searchMode === "history" ? (
        <>
          {historyStoresError ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{historyStoresError}</div> : null}
          <div className="mt-4 space-y-2 pb-24">
            {historyStoresLoading && historyResults.length === 0 ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                  <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-48 animate-pulse rounded bg-slate-100" />
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                  <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-52 animate-pulse rounded bg-slate-100" />
                </div>
              </>
            ) : null}
            {!historyStoresLoading && historyStoresEmpty ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
                <div>{labels.historyStoresEmpty}</div>
                <div className="mt-1">{labels.noStoreFound}</div>
              </div>
            ) : null}
            {historyResults.map((store) => (
              <button
                key={store.store_id}
                type="button"
                onClick={() => onSelect(toOfflineStoreOption(store))}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <Building2 className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{store.name}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">{formatStoreRegionText(store) || "-"}</span>
                  <span className="mt-1 block truncate text-[11px] text-slate-400">
                    {labels.recentVisit} {formatVisitDate(store.last_visit_at, locale)} / {labels.visitCountLabel} {store.visit_count}{labels.visitCountUnit}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md px-4 pb-4">
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSearchMode("new_store");
              }}
              className="pointer-events-auto flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white shadow-[0_-6px_24px_rgba(15,23,42,0.12)]"
            >
              <Plus className="h-4 w-4" />
              {labels.historyEntryAction}
            </button>
          </div>
        </>
      ) : (
        <NewStoreSearchFlow locale={locale} user={user} query={query} onAuthFailure={onAuthFailure} onSelect={onSelect} />
      )}
    </section>
  );
}

function NewStoreSearchFlow({
  locale,
  user,
  query,
  onAuthFailure,
  onSelect,
}: {
  locale: Locale;
  user: AppUser;
  query: string;
  onAuthFailure: (response: Response, message?: string | null) => boolean;
  onSelect: (store: OfflineStoreOption) => void;
}) {
  const labels = uiCopy(locale);
  const [googleResults, setGoogleResults] = useState<GoogleStoreOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [storeLocation, setStoreLocation] = useState<StoreLocationEvidence | null>(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [materializingStore, setMaterializingStore] = useState("");
  const [pendingGoogleStore, setPendingGoogleStore] = useState<GoogleStoreOption | null>(null);
  const googleSearchEmpty = !loading && googleResults.length === 0;

  function locateStores() {
    if (!navigator.geolocation) {
      setLocationStatus(labels.locationUnavailable);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLocationStatus(labels.locatingStores);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStoreLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          location_accuracy_m: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null,
          location_captured_at: new Date().toISOString(),
        });
        setLocationStatus(query.trim() ? labels.matchedSorted : labels.nearbySorted);
      },
      () => {
        setLocationStatus(labels.locationFailed);
        setLoading(false);
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 8_000 },
    );
  }

  useEffect(() => {
    if (!storeLocation && !query.trim()) {
      const timeout = window.setTimeout(() => locateStores(), 0);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!query.trim() && !storeLocation) {
      const timeout = window.setTimeout(() => {
        if (!cancelled) {
          setGoogleResults([]);
          setLoading(false);
        }
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
      };
    }
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set("limit", query.trim() ? "20" : "10");
      if (query.trim()) params.set("query", query.trim());
      if (storeLocation) {
        params.set("lat", String(storeLocation.latitude));
        params.set("lon", String(storeLocation.longitude));
      }
      try {
        const res = await fetch(`/api/google-store-search?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) {
            if (onAuthFailure(res, typeof data.error === "string" ? data.error : null)) return;
            setError(data.error ?? labels.googleSearchFailed);
            setGoogleResults([]);
          }
          return;
        }
        if (!cancelled) {
          setGoogleResults((data.stores ?? []) as GoogleStoreOption[]);
          setLocationStatus(query.trim() ? labels.matchedSorted : (storeLocation ? labels.nearbySorted : ""));
        }
      } catch {
        if (!cancelled) {
          setError(labels.googleSearchFailed);
          setGoogleResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [labels.googleSearchFailed, labels.matchedSorted, labels.nearbySorted, onAuthFailure, query, storeLocation]);

  function chooseGoogleStore(store: GoogleStoreOption) {
    setError(null);
    if (store.local_store) {
      onSelect(store.local_store);
      return;
    }
    setPendingGoogleStore(store);
  }

  async function materializeSelectedGoogleStore(store: GoogleStoreOption, selectedExternalStore: ExternalMdStoreOption) {
    setMaterializingStore(store.google_place_id);
    setError(null);
    try {
      const res = await fetch("/api/google-store-select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          google_place_id: store.google_place_id,
          name: store.name,
          city: store.city,
          province: store.province ?? null,
          cityName: store.cityName ?? null,
          district: store.district ?? null,
          address: store.address ?? null,
          latitude: store.latitude ?? null,
          longitude: store.longitude ?? null,
          external_store_id: selectedExternalStore.code,
          external_store_name: selectedExternalStore.name,
          external_org_id: selectedExternalStore.zoneId ?? null,
          external_org_name: selectedExternalStore.zoneName ?? null,
          external_md_id: selectedExternalStore.dealerUserId,
          external_md_name: selectedExternalStore.dealerName ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (onAuthFailure(res, typeof data.error === "string" ? data.error : null)) return;
        setError(data.error ?? labels.googleMaterializeFailed);
        return;
      }
      setPendingGoogleStore(null);
      onSelect(data.store as OfflineStoreOption);
    } catch {
      setError(labels.googleMaterializeFailed);
    } finally {
      setMaterializingStore("");
    }
  }

  return (
    <>
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
            <LocateFixed className="h-3 w-3" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] leading-4 text-slate-500">{locationStatus || (query.trim() ? labels.matchedSorted : labels.nearbySorted)}</div>
          </div>
          <button
            type="button"
            onClick={locateStores}
            aria-label={labels.useCurrentLocation}
            title={labels.useCurrentLocation}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100"
          >
            <RefreshCw className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
      {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="mt-4 space-y-2">
        {loading && googleResults.length === 0 ? (
          <>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
              <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-3 w-48 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
              <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-3 w-52 animate-pulse rounded bg-slate-100" />
            </div>
          </>
        ) : null}
        {!loading && googleResults.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
            <div>{labels.googleSearchEmpty}</div>
            <div className="mt-1">{labels.noStoreFound}</div>
          </div>
        ) : null}
        {googleResults.map((store) => (
          <button
            key={store.google_place_id}
            type="button"
            onClick={() => chooseGoogleStore(store)}
            disabled={materializingStore === store.google_place_id}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{store.name}</span>
              <span className="mt-1 block truncate text-xs text-slate-500">{formatStoreRegionText(store) || "-"}</span>
              {store.address ? <span className="mt-1 block truncate text-[11px] text-slate-400">{store.address}</span> : null}
            </span>
            <span className="shrink-0 text-right text-xs text-slate-400">
              {materializingStore === store.google_place_id ? labels.choosingStore : formatDistance(store.distance_m) ?? ""}
            </span>
          </button>
        ))}
      </div>
      {googleSearchEmpty ? (
        <button type="button" onClick={() => setShowCreate(true)} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white">
          <Plus className="h-4 w-4" />
          {labels.createStore}
        </button>
      ) : null}

      {showCreate ? (
        <CreateStoreSheet
          locale={locale}
          user={user}
          onClose={() => setShowCreate(false)}
          onAuthFailure={onAuthFailure}
          onCreated={(store) => {
            setShowCreate(false);
            onSelect(store);
          }}
        />
      ) : null}
      {pendingGoogleStore && !pendingGoogleStore.local_store ? (
        <GoogleStoreTypeSheet
          locale={locale}
          store={pendingGoogleStore}
          loading={materializingStore === pendingGoogleStore.google_place_id}
          onClose={() => {
            if (materializingStore) return;
            setPendingGoogleStore(null);
          }}
          onAuthFailure={onAuthFailure}
          onConfirm={(selectedChannel) => materializeSelectedGoogleStore(pendingGoogleStore, selectedChannel)}
        />
      ) : null}
    </>
  );
}

function GoogleStoreTypeSheet({
  locale,
  store,
  loading,
  onClose,
  onAuthFailure,
  onConfirm,
}: {
  locale: Locale;
  store: GoogleStoreOption | null;
  loading: boolean;
  onClose: () => void;
  onAuthFailure: (response: Response, message?: string | null) => boolean;
  onConfirm: (selectedExternalStore: ExternalMdStoreOption) => void;
}) {
  const labels = uiCopy(locale);
  const [selectedDealer, setSelectedDealer] = useState<ExternalDealerOption | null>(null);
  const [selectedExternalStore, setSelectedExternalStore] = useState<ExternalMdStoreOption | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/40">
      <div className="flex max-h-[100dvh] w-full max-w-md flex-col bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{labels.confirmGoogleStoreTypeTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{labels.confirmGoogleStoreTypeHint}</p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} className="rounded-full p-1 text-slate-500 disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {store ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-bold text-slate-900">{store.name}</div>
              <div className="mt-1 text-xs text-slate-500">{formatStoreRegionText(store) || "-"}</div>
              {store.address ? <div className="mt-1 text-xs text-slate-400">{store.address}</div> : null}
            </div>
          ) : null}
          <div className="mt-4">
            <DealerStoreSelector
              locale={locale}
              loading={loading}
              onAuthFailure={onAuthFailure}
              onSelectionChange={({ selectedDealer: nextDealer, selectedExternalStore: nextStore }) => {
                setSelectedDealer(nextDealer);
                setSelectedExternalStore(nextStore);
              }}
            />
          </div>
        </div>
        <div className="sticky bottom-0 border-t border-slate-100 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={() => {
              if (!selectedExternalStore) return;
              onConfirm(selectedExternalStore);
            }}
            disabled={loading || !selectedDealer || !selectedExternalStore || !store}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            {labels.confirmGoogleStoreTypeAction}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateStoreSheet({
  locale,
  user,
  onClose,
  onAuthFailure,
  onCreated,
}: {
  locale: Locale;
  user: AppUser;
  onClose: () => void;
  onAuthFailure: (response: Response, message?: string | null) => boolean;
  onCreated: (store: OfflineStoreOption) => void;
}) {
  const labels = uiCopy(locale);
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [cityName, setCityName] = useState("");
  const [district, setDistrict] = useState("");
  const [address, setAddress] = useState("");
  const [entryLocationReady, setEntryLocationReady] = useState(false);
  const [entryLocationChecking, setEntryLocationChecking] = useState(false);
  const [entryLocationError, setEntryLocationError] = useState<string | null>(null);
  const [storeLocation, setStoreLocation] = useState<StoreLocationEvidence | null>(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDealer, setSelectedDealer] = useState<ExternalDealerOption | null>(null);
  const [selectedExternalStore, setSelectedExternalStore] = useState<ExternalMdStoreOption | null>(null);

  const ensureEntryLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setEntryLocationReady(false);
      setEntryLocationChecking(false);
      setEntryLocationError(labels.entryLocationUnsupported);
      return;
    }

    setEntryLocationChecking(true);
    setEntryLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setEntryLocationReady(true);
        setEntryLocationChecking(false);
        setEntryLocationError(null);
        setStoreLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          location_accuracy_m: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null,
          location_captured_at: new Date().toISOString(),
        });
      },
      () => {
        setEntryLocationReady(false);
        setEntryLocationChecking(false);
        setEntryLocationError(labels.entryLocationDenied);
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 8_000 },
    );
  }, [labels.entryLocationDenied, labels.entryLocationUnsupported]);

  useEffect(() => {
    if (entryLocationReady || entryLocationChecking) return;
    const timeout = window.setTimeout(() => ensureEntryLocation(), 0);
    return () => window.clearTimeout(timeout);
  }, [ensureEntryLocation, entryLocationChecking, entryLocationReady]);

  function captureStoreLocation() {
    if (!navigator.geolocation) {
      setLocationStatus(labels.locationUnavailable);
      return;
    }

    setLocating(true);
    setLocationStatus("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const capturedLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          location_accuracy_m: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null,
          location_captured_at: new Date().toISOString(),
        };
        setStoreLocation(capturedLocation);

        try {
          const params = new URLSearchParams({
            lat: String(capturedLocation.latitude),
            lon: String(capturedLocation.longitude),
          });
          const res = await fetch(`/api/location/reverse?${params.toString()}`);
          const data = (await res.json().catch(() => ({}))) as ReverseLocationResponse;
          if (!res.ok) {
            setLocationStatus(labels.reverseAddressFailed);
            return;
          }
          if (data.city) setCity(data.city);
          if (data.province) setProvince(data.province);
          if (data.cityName) setCityName(data.cityName);
          if (data.district) setDistrict(data.district);
          if (data.address) setAddress(data.address);
          setLocationStatus(data.city || data.address ? "" : labels.reverseAddressMissing);
        } catch {
          setLocationStatus(labels.reverseAddressFailed);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocationStatus(labels.locationFailed);
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 8_000 },
    );
  }

  async function createStore() {
    if (!selectedDealer || !selectedExternalStore || !city.trim()) {
      setError(labels.createRequired);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/offline-stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedExternalStore.name,
          city,
          province,
          city_name: cityName,
          district,
          external_store_id: selectedExternalStore.code,
          external_store_name: selectedExternalStore.name,
          external_org_id: selectedExternalStore.zoneId ?? null,
          external_org_name: selectedExternalStore.zoneName ?? selectedDealer.zoneName ?? null,
          external_md_id: selectedExternalStore.dealerUserId,
          external_md_name: selectedExternalStore.dealerName ?? selectedDealer.name,
          address,
          latitude: storeLocation?.latitude ?? null,
          longitude: storeLocation?.longitude ?? null,
          location_accuracy_m: storeLocation?.location_accuracy_m ?? null,
          location_captured_at: storeLocation?.location_captured_at ?? null,
          created_by_user_id: user.id,
          created_by_name: user.displayName,
          created_by: user.displayName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (onAuthFailure(res, typeof data.error === "string" ? data.error : null)) return;
        setError(data.error ?? labels.createFailed);
        return;
      }
      onCreated(data.store as OfflineStoreOption);
    } catch {
      setError(labels.createFailed);
    } finally {
      setLoading(false);
    }
  }

  if (!entryLocationReady) {
    return (
      <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/40">
        <div className="flex max-h-[100dvh] w-full max-w-md flex-col bg-white shadow-xl">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
            <h2 className="text-lg font-bold">{labels.entryLocationRequiredTitle}</h2>
            <button type="button" onClick={onClose} disabled={entryLocationChecking} className="rounded-full p-1 text-slate-500 disabled:opacity-50">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <p className="text-sm text-slate-500">{labels.entryLocationRequiredBody}</p>
            <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <div className="flex items-start gap-3 text-amber-900">
                <LocateFixed className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{entryLocationChecking ? labels.entryLocationChecking : entryLocationError ?? labels.entryLocationDenied}</div>
                </div>
              </div>
            </section>
          </div>
          <div className="sticky bottom-0 border-t border-slate-100 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={ensureEntryLocation}
              disabled={entryLocationChecking}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white disabled:opacity-60"
            >
              {entryLocationChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {labels.entryLocationRetry}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/40">
      <div className="flex max-h-[100dvh] w-full max-w-md flex-col bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <h2 className="text-lg font-bold">{labels.createStore}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <div className="space-y-3">
            <DealerStoreSelector
              locale={locale}
              loading={loading}
              onAuthFailure={onAuthFailure}
              onSelectionChange={({ selectedDealer: nextDealer, selectedExternalStore: nextStore }) => {
                setSelectedDealer(nextDealer);
                setSelectedExternalStore(nextStore);
              }}
            />
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900">{labels.storeLocationGroup}</div>
            </div>
            <div className="mt-3 space-y-3">
              <input required value={city} onChange={(event) => setCity(event.target.value)} placeholder={labels.cityRequired} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" />
              <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder={labels.addressOptional} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" />
              <button
                type="button"
                onClick={captureStoreLocation}
                disabled={locating}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-60"
              >
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                {locating ? labels.locating : labels.locate}
              </button>
            </div>
            {storeLocation ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {labels.located}
                {storeLocation.location_accuracy_m !== null ? ` / ${storeLocation.location_accuracy_m}m` : null}
              </div>
            ) : null}
            {locationStatus ? <div className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-600">{locationStatus}</div> : null}
            <div className="mt-3 text-[11px] font-medium text-slate-400">{labels.locationAttribution}</div>
          </div>
        </div>
        <div className="sticky bottom-0 border-t border-slate-100 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={createStore} disabled={loading || !selectedDealer || !selectedExternalStore} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            {labels.createStore}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 items-start gap-1 rounded-lg bg-slate-50 px-3 py-2 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-3">
      <span className="min-w-0 break-words text-xs font-semibold leading-5 text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-left text-sm font-medium leading-5 text-slate-900 sm:text-right">{value}</span>
    </div>
  );
}

function ImageUploadSection({
  title,
  required,
  addLabel,
  uploadedLabel,
  emptyText,
  images,
  disabled,
  onOpenSourceSheet,
  onRemove,
}: {
  title: string;
  required: boolean;
  addLabel: string;
  uploadedLabel: string;
  emptyText: string;
  images: PendingImage[];
  disabled: boolean;
  onOpenSourceSheet: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {title}
            {required ? <span className="ml-1 text-red-500">*</span> : null}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-xs text-slate-500">{images.length} {uploadedLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenSourceSheet}
          disabled={disabled}
          className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white ${disabled ? "cursor-not-allowed bg-slate-300" : "cursor-pointer bg-blue-600"}`}
        >
          <Camera className="h-4 w-4" />
          {addLabel}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {images.map((image, index) => (
          <div key={image.preview} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.preview} alt={`${title} ${index + 1}`} className="h-full w-full object-cover" />
            <button type="button" onClick={() => onRemove(index)} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {images.length === 0 ? <div className="col-span-3 rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">{emptyText}</div> : null}
      </div>
    </div>
  );
}
