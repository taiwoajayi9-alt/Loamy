import { describe, expect, it } from "vitest";
import { BUCKETS, checkPhotoSize, GARDEN_PHOTO_RULES, photoPath, PLANT_PHOTO_RULES, publicUrl } from "@/lib/photos";

describe("plant photos", () => {
  it("accept landscape and portrait within 3:4 to 3:2, at least 1200 px", () => {
    expect(checkPhotoSize(1800, 1350, PLANT_PHOTO_RULES)).toBeNull();
    expect(checkPhotoSize(1200, 1600, PLANT_PHOTO_RULES)).toBeNull();
    expect(checkPhotoSize(1000, 800, PLANT_PHOTO_RULES)).toMatch(/too small/);
    expect(checkPhotoSize(3000, 1200, PLANT_PHOTO_RULES)).toMatch(/Crop it/);
  });
});

describe("members' photos", () => {
  it("accept ordinary phone photos but not tiny or strip-shaped ones", () => {
    expect(checkPhotoSize(3024, 4032, GARDEN_PHOTO_RULES)).toBeNull();
    expect(checkPhotoSize(300, 300, GARDEN_PHOTO_RULES)).toMatch(/too small/);
    expect(checkPhotoSize(4000, 500, GARDEN_PHOTO_RULES)).toMatch(/Crop it/);
  });
  it("live in a private bucket under the member's own folder", () => {
    expect(BUCKETS.garden).toBe("garden-photos");
    expect(photoPath("users/u1/gp1", "image/jpeg", "abc")).toBe("users/u1/gp1/abc.jpg");
    expect(publicUrl("https://x.supabase.co", BUCKETS.plants, "plants/p/a.jpg")).toBe("https://x.supabase.co/storage/v1/object/public/plant-images/plants/p/a.jpg");
  });
});
