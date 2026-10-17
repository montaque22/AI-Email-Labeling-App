import { dbPool } from "../server/db.js";
import { resetLocalDatabaseFixture } from "./local-db-fixture.js";

try {
  console.log("Local database reset to pristine fixture state:", await resetLocalDatabaseFixture());
} finally {
  await dbPool?.end();
}
