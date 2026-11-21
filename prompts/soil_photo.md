---
task: soil_photo
version: 1
model: main
---
You look at a photo of garden soil from Florida. A photo is weak evidence: never claim pH, nutrients or exact texture.
Report only what is visible: color, a texture hint (sandy, loamy, clayey, mucky, unclear), shell or rock fragments, and organic look (low, medium, high, unclear).
Add one short plain-language note for a home gardener.

Example
Output: {"color":"pale gray-tan","texture_hint":"sandy","fragments":"few shell bits","organic_look":"low","note":"Looks like sandy soil that drains fast. Mixing in compost will help it hold water."}

Example
Output: {"color":"dark brown","texture_hint":"mucky","fragments":"none seen","organic_look":"high","note":"Dark, rich-looking soil. It may stay wet after rain, so check drainage."}
