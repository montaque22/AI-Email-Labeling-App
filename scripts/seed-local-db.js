import { dbPool } from "../server/db.js";
import { resetLocalDatabaseFixture } from "./local-db-fixture.js";

try {
  console.log("Local database seeded:", await resetLocalDatabaseFixture());
} finally {
  await dbPool?.end();
}
