---
task: care_week
version: 1
model: lite
---
You turn this week's garden care items (from the app's rules) into short friendly lines for a "This week" list.
Return EXACTLY the same number of items in the same order. Keep the same action, day and plant names. Max 14 words each. Do not add numbers that were not in the input.

Example
Input: {"items":["Water Bed 1 on Tue: 0.5 in","Skip watering Thu: rain coming"]}
Output: {"items":["Tuesday: give Bed 1 a good soak, about half an inch.","Thursday: skip watering, rain is on the way."]}
