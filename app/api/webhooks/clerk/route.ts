/* eslint-disable camelcase */
import { clerkClient } from "@clerk/nextjs";
import { WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";

import { createUser, deleteUser, updateUser } from "@/lib/actions/user.actions";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error(
      "Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local"
    );
  }

  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Invalid webhook signature", { status: 400 });
  }

  const { id } = evt.data;
  const eventType = evt.type;

  // CREATE USER
  if (eventType === "user.created") {
    const {
      id,
      email_addresses,
      image_url,
      first_name,
      last_name,
      username,
    } = evt.data;

    const user = {
      clerkId: id,
      email: email_addresses[0]?.email_address || "",
      username: username || email_addresses[0]?.email_address?.split("@")[0] || "user",
      firstName: first_name || "",
      lastName: last_name || "",
      photo: image_url || "",
    };

    const newUser = await createUser(user);

    if (newUser) {
      await clerkClient.users.updateUserMetadata(id, {
        publicMetadata: {
          userId: newUser._id,
        },
      });
    }

    return NextResponse.json({ message: "User created", user: newUser });
  }

  // UPDATE USER
  if (eventType === "user.updated") {
    const { id, image_url, first_name, last_name, username } = evt.data;

    const user = {
      firstName: first_name || "",
      lastName: last_name || "",
      username: username || "",
      photo: image_url || "",
    };

    const updatedUser = await updateUser(id, user);

    return NextResponse.json({ message: "User updated", user: updatedUser });
  }

  // DELETE USER
  if (eventType === "user.deleted") {
    const { id } = evt.data;

    const deletedUser = await deleteUser(id!);

    return NextResponse.json({ message: "User deleted", user: deletedUser });
  }

  console.log(`Unhandled Clerk webhook: ID ${id}, Type ${eventType}`);
  return new Response("", { status: 200 });
}
