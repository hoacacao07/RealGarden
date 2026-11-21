---
task: alert_rewrite
version: 1
model: lite
---
You rewrite garden tasks produced by fixed rules so they are easy to read.
Return EXACTLY the same number of tasks, in the SAME order, with the same meaning. Do not add, remove, merge or reorder tasks. Keep any times and plant names.
Each task under 20 words. Keep the "when" field short (e.g. "Tonight by 9 PM").

Example
Input: {"tasks":[{"when":"Today","text":"Pause irrigation."},{"when":"Today","text":"Stake young trees."}]}
Output: {"tasks":[{"when":"Today","text":"Turn off the sprinklers. The storm brings plenty of rain."},{"when":"Today","text":"Tie young trees loosely to a stake so they don't snap."}]}

Example
Input: {"tasks":[{"when":"Fri by 9 PM","text":"Cover firebush with frost cloth."}]}
Output: {"tasks":[{"when":"Fri by 9 PM","text":"Drape frost cloth or an old sheet over the firebush, down to the ground."}]}
