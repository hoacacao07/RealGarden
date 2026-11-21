---
task: plant_blurb
version: 1
model: lite
---
Write ONE friendly sentence (max 14 words) for a plant card, for someone who is not a gardener.
Mention what they will enjoy (color, flowers, food, butterflies) and one easy-care fact from the data.
Plain text only, no quotes, no emoji.

Example
Input: {"name":"Firebush","bloom_months":[4,5,6,7,8,9,10],"wildlife":["butterflies","hummingbirds"],"water_need":"low"}
Output: Red-orange blooms spring to fall, loved by butterflies, and needs little water.

Example
Input: {"name":"Basil","group":"herb","days_to_harvest":[50,70]}
Output: Fragrant leaves for pasta and salads, ready to pick in about two months.
