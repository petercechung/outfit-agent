// Simulated shoppers with a hidden taste, used by 我的 → 進步驗證 (views/progress.js) to show what the stylist's
// style memory is worth: the same shopper and the same sentences, with the memory on and off.
/** Hidden tastes. Colours are catalog colour_master values, types are product_type_name values. */
export const PERSONAS = [
  { name: "米色控", likes: { colour: ["Beige"], type: [] }, avoids: ["Black"] },
  { name: "洋裝派", likes: { colour: [], type: ["Dress"] }, avoids: ["Red"] },
  { name: "藍色系", likes: { colour: ["Blue"], type: [] }, avoids: ["Pink"] },
  { name: "甜美粉", likes: { colour: ["Pink"], type: ["Skirt"] }, avoids: ["Black"] },
  { name: "黑白極簡", likes: { colour: ["Black", "White"], type: [] }, avoids: ["Yellow", "Orange", "Red"] },
  { name: "裙裝派", likes: { colour: [], type: ["Skirt", "Blouse"] }, avoids: ["Grey"] },
  { name: "大地色", likes: { colour: ["Brown", "Khaki green"], type: [] }, avoids: ["Pink"] },
  { name: "襯衫控", likes: { colour: ["White"], type: ["Shirt"] }, avoids: ["Lilac Purple"] },
];

/** Everyday requests the shoppers cycle through. */
export const SENTENCES = ["日常穿搭", "週末跟朋友逛街", "上班通勤穿搭", "約會穿搭", "上課穿搭"];

