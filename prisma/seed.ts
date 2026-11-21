import "dotenv/config";

import { prisma } from "../lib/db";
import { seedAll } from "../lib/seed";

seedAll(prisma)
  .then((r) => console.log(`Seeded ${r.plants} plants, ${r.reports} sample reports, gardens ${r.gardens.join(", ")}.`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
