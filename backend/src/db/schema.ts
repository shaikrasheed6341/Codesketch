import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("users", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    password:text("password").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
})

export const room = pgTable("room",{
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    roomcode: integer("roomcode").notNull(),
    active: boolean("active").default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(), 
})

export const roommember = pgTable("roommember", {
    id: serial("id").primaryKey(),
    roomId: integer("room_id").notNull().references(() => room.id),
    userId: integer("user_id").notNull().references(() => user.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(), 
})