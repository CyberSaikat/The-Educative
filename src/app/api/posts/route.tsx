import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/options";
import { CustomUser } from "@/abstract/type";
import conn from "@/database/config";
import User from "@/models/user";
import Post from "@/models/Post";
import mongoose, { MongooseError } from "mongoose";
import { firebaseStorage } from "@/database/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

export async function GET(req: NextRequest) {

  try {
    mongoose.set('bufferCommands', false);
    mongoose.connection.set('serverSelectionTimeoutMS', 30000);
    await conn();

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "6", 10);
    const skip = (page - 1) * limit;

    let filters: mongoose.PipelineStage[] = [
      {
        $match: {
          status: "published",
        },
      },
      {
        $sort: { publish_date: -1 },
      },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      {
        $unwind: {
          path: "$category",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "subcategories",
          localField: "subcategory",
          foreignField: "_id",
          as: "subcategory",
        },
      },
      {
        $unwind: {
          path: "$subcategory",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "tags",
          localField: "tags",
          foreignField: "_id",
          as: "tags",
        },
      },
      {
        $project: {
          title: 1,
          slug: 1,
          content: 1,
          excerpt: 1,
          author: 1,
          category: { $ifNull: ["$category._id", null] },
          subcategory: { $ifNull: ["$subcategory._id", null] },
          tags: {
            $map: {
              input: "$tags",
              as: "tag",
              in: "$$tag._id",
            },
          },
          publish_date: {
            $dateToString: { format: "%d-%m-%Y", date: "$publish_date" },
          },
          categoryName: { $ifNull: ["$category.name", null] },
          subcategoryName: { $ifNull: ["$subcategory.name", null] },
          tagNames: {
            $map: {
              input: "$tags",
              as: "tag",
              in: "$$tag.name",
            },
          },
          metaTitle: 1,
          metaDescription: 1,
          metaKeywords: 1,
          featuredImage: 1,
          imageCredit: 1,
          status: 1,
          updated_date: 1,
        },
      },
      { $skip: skip },
      { $limit: limit },
    ];
    const posts = await Post.aggregate(filters);
    const totalPosts = await Post.countDocuments({ status: "published" });
    const totalPages = Math.ceil(totalPosts / limit);

    return NextResponse.json({ posts, totalPages }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { status: "error", message: e.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.formData();

  const id = body.get("_id");
  const title = body.get("title");
  const slug = body.get("slug");
  const content = body.get("content");
  const excerpt = body.get("excerpt");
  const author = body.get("author");
  const category = body.get("category");
  const subcategory = body.get("subcategory");
  const tags = body.getAll("tags");
  const metaTitle = body.get("metaTitle");
  const metaDescription = body.get("metaDescription");
  const metaKeywords = body.get("metaKeywords");
  const featuredImage = body.get("featuredImage");
  const tagsString = tags.join(",");
  const filteredTags = tagsString.split(",").map((tag) => tag.trim());
  const status = body.get("status");
  const imageCredit = body.get("imageCredit");

  if (!title || !content || !author || !category || !subcategory) {
    return NextResponse.json(
      {
        message:
          "Title, content, author, category, and subcategory are required",
      },
      { status: 400 }
    );
  }

  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { status: "error", message: "Unauthorized" },
      { status: 401 }
    );
  } else {
    try {
      const user = session.user as CustomUser;
      await conn();
      const currentUser = await User.findOne({ _id: user._id });

      if (!currentUser) {
        return NextResponse.json(
          { status: "error", message: "User not found" },
          { status: 404 }
        );
      } else {
        const newPost = new Post({
          title,
          slug,
          content,
          excerpt,
          author,
          category,
          subcategory,
          tags: filteredTags,
          metaTitle,
          metaDescription,
          metaKeywords,
          featuredImage: "",
          imageCredit,
          status,
        });

        if (featuredImage instanceof File) {
          const bucket = firebaseStorage;
          const file = featuredImage;
          const ext = file.type.split("/").pop();
          const fileName = `the-educative/blog/post-${(Math.random() * 100000000000).toFixed(0)}.${ext}`;

          const spaceRef = ref(bucket, fileName);

          const uploadTask = uploadBytesResumable(spaceRef, file);

          await uploadTask;

          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          newPost.featuredImage = downloadURL;
        }

        await newPost.save();
        return NextResponse.json(
          { message: "Post created successfully" },
          { status: 201 }
        );
      }
    } catch (e: any) {
      if (e instanceof MongooseError) {
        return NextResponse.json(
          { status: "error", message: e.message },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { status: "error", message: e },
        { status: 500 }
      );
    }
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.formData();

  const id = body.get("_id");
  const title = body.get("title");
  const slug = body.get("slug");
  const content = body.get("content");
  const excerpt = body.get("excerpt");
  const author = body.get("author");
  const category = body.get("category");
  const subcategory = body.get("subcategory");
  const tags = body.getAll("tags");
  const metaTitle = body.get("metaTitle");
  const metaDescription = body.get("metaDescription");
  const metaKeywords = body.get("metaKeywords");
  const featuredImage = body.get("featuredImage");
  const imageCredit = body.get("imageCredit");
  const tagsString = tags.join(",");
  const filteredTags = tagsString.split(",").map((tag: string) => tag.trim());
  const status = body.get("status");


  if (!title || !content || !author || !category || !subcategory) {
    return NextResponse.json(
      {
        message:
          "Title, content, author, category, and subcategory are required",
      },
      { status: 400 }
    );
  }

  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { status: "error", message: "Unauthorized" },
      { status: 401 }
    );
  } else {
    try {
      const user = session.user as CustomUser;
      await conn();
      const currentUser = await User.findOne({ _id: user._id });

      if (!currentUser) {
        return NextResponse.json(
          { status: "error", message: "User not found" },
          { status: 404 }
        );
      } else {
        if (id) {
          const post = await Post.findOne({ _id: id });
          if (!post) {
            return NextResponse.json(
              { status: "error", message: "Post not found" },
              { status: 404 }
            );
          } else {
            post.title = title;
            post.content = content;
            post.excerpt = excerpt;
            post.author = author;
            post.category = category;
            post.subcategory = subcategory;
            post.tags = filteredTags;
            post.metaTitle = metaTitle;
            post.metaDescription = metaDescription;
            post.metaKeywords = metaKeywords;
            post.imageCredit = imageCredit;
            post.status = status;

            if (featuredImage instanceof File) {
              const bucket = firebaseStorage;
              const file = featuredImage;
              const ext = file.type.split("/").pop();
              const fileName = `the-educative/blog/post-${id}.${ext}`;

              const spaceRef = ref(bucket, fileName);

              const uploadTask = uploadBytesResumable(spaceRef, file);

              await uploadTask;

              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              post.featuredImage = downloadURL;
            }
            await post.save();
            return NextResponse.json(
              { message: "Post updated successfully" },
              { status: 200 }
            );
          }
        } else {
          return NextResponse.json(
            { status: "error", message: "Invalid Post" },
            { status: 400 }
          );
        }
      }
    } catch (e: any) {
      if (e instanceof MongooseError) {
        return NextResponse.json(
          { status: "error", message: e.message },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { status: "error", message: e },
        { status: 500 }
      );
    }
  }
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();

  const id = body.id;

  if (!id) {
    return NextResponse.json(
      { message: "ID is required" },
      { status: 400 }
    );
  }

  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { status: "error", message: "Unauthorized" },
      { status: 401 }
    );
  } else {
    try {
      const user = session.user as CustomUser;
      await conn();
      const currentUser = await User.findOne({ _id: user._id });

      if (!currentUser) {
        return NextResponse.json(
          { status: "error", message: "User not found" },
          { status: 404 }
        );
      } else {
        const post = await Post.findOneAndDelete({ _id: id });
        if (!post) {
          return NextResponse.json(
            { status: "error", message: "Post not found" },
            { status: 404 }
          );
        } else {
          return NextResponse.json(
            { message: "Post deleted successfully" },
            { status: 200 }
          );
        }
      }
    } catch (e: any) {
      return NextResponse.json(
        { status: "error", message: e.message },
        { status: 500 }
      );
    }
  }
}