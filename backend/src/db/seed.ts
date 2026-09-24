import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "./postgres.js";
import { room, roommember, user } from "./schema.js";

const seedPassword = "password123";

const users = [
  { name: "Demo User", email: "demo@codesketch.local" },
  { name: "Alice", email: "alice@codesketch.local" },
];

const rooms = [
  { name: "Design Room", description: "Collaborative design workspace", roomcode: 1001 },
  { name: "Planning Room", description: "Project planning workspace", roomcode: 1002 },
];

async function seed() {
  const password = await bcrypt.hash(seedPassword, 10);
  const seededUsers: Array<{ id: number }> = [];

  for (const seedUser of users) {
    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, seedUser.email));

    if (existingUser) {
      seededUsers.push(existingUser);
      continue;
    }

    const [createdUser] = await db
      .insert(user)
      .values({ ...seedUser, password })
      .returning({ id: user.id });

    if (createdUser) seededUsers.push(createdUser);
  }

  const seededRooms: Array<{ id: number }> = [];
  for (const seedRoom of rooms) {
    const [existingRoom] = await db
      .select({ id: room.id })
      .from(room)
      .where(eq(room.roomcode, seedRoom.roomcode));

    if (existingRoom) {
      seededRooms.push(existingRoom);
      continue;
    }

    const [createdRoom] = await db
      .insert(room)
      .values({ ...seedRoom, active: true })
      .returning({ id: room.id });

    if (createdRoom) seededRooms.push(createdRoom);
  }

  if (seededUsers[0] && seededRooms[0]) {
    const [existingMember] = await db
      .select({ id: roommember.id })
      .from(roommember)
      .where(eq(roommember.userId, seededUsers[0].id));

    if (!existingMember) {
      await db.insert(roommember).values({
        userId: seededUsers[0].id,
        roomId: seededRooms[0].id,
      });
    }
  }

  console.log("Seed complete");
  console.log("Demo login: demo@gmail.com / demo");
  console.log("Room codes: 1001, 1002");
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  });
