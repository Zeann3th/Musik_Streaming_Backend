import backblaze from "@/services/backblaze";
import { cloudinary } from "@/services/cloudinary";
import redis from "@/services/redis";
import supabase from "@/services/supabase";
import { Request, RequestHandler, Response } from "express";

const getAllSongs: RequestHandler = async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;

  const cache = await redis.get(`songs?page=${page}&limit=${limit}`);
  if (cache) {
    console.log("Fetch data from cache");
    res.status(200).json(cache);
    return;
  }

  const { data, error } = await supabase
    .from("songs")
    .select()
    .range((page - 1) * limit, page * limit - 1);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  redis.set(`songs?page=${page}&limit=${limit}`, JSON.stringify(data), {
    ex: 300,
  });
  res.status(200).json({ data });
  return;
};

const getSongByID: RequestHandler = async (req: Request, res: Response) => {
  const cache = await redis.get(`songs?id=${req.params.id}`);
  if (cache) {
    console.log("Fetch data from cache");
    res.status(200).json(cache);
    return;
  }

  const { data, error } = await supabase
    .from("songs")
    .select()
    .eq("id", req.params.id)
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  redis.set(`songs?id=${req.params.id}`, JSON.stringify(data), {
    ex: 300,
  });
  res.status(200).json({ data });
  return;
};

const generatePresignedDownloadURL: RequestHandler = async (
  req: Request,
  res: Response,
) => {
  const id = req.params.id;

  const { data, error } = await supabase
    .from("artistssongs")
    .select("artist: artists (name), song: songs (title)")
    .match({ relation: "Primary", songid: id })
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (!data.song || !data.artist) {
    res.status(404).json({ error: "Artist or Song does not exist" });
    return;
  }

  const fileName: string = `${data.artist.name}/${data.song.title}.mp3`;
  let url: string;
  try {
    url = await backblaze.generatePresignedDownloadURL(fileName, 1800);
  } catch (err) {
    res.status(500).json({ error: `Error generating pre-signed URL: ${err}` });
    return;
  }

  res.status(200).json({ url });
  return;
};

const generatePresignedUploadURL: RequestHandler = async (
  req: Request,
  res: Response,
) => {
  const id = req.params.id;

  const { data, error } = await supabase
    .from("artistssongs")
    .select("artist: artists (name), song: songs (title)")
    .match({ relation: "Primary", songid: id })
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (!data.song || !data.artist) {
    res.status(404).json({ error: "Artist or Song does not exist" });
    return;
  }

  const fileName: string = `${data.artist.name}/${data.song.title}.mp3`;
  let url: string;
  try {
    url = await backblaze.generatePresignedUploadURL(fileName, 900);
  } catch (err) {
    res.status(500).json({ error: `Error generating pre-signed URL: ${err}` });
    return;
  }

  res.status(200).json({ url });
  return;
};

const updateSong: RequestHandler = async (req: Request, res: Response) => {
  const id = req.params.id;
  const {
    title,
    description,
    thumbnailurl,
    duration,
    releasedate,
    genre,
    views,
  } = req.body;

  const response = {
    ...(title && { title }),
    ...(description && { description }),
    ...(thumbnailurl && { thumbnailurl }),
    ...(duration && { duration }),
    ...(releasedate && { releasedate }),
    ...(genre && { genre }),
    ...(views && { views }),
  };

  const { error } = await supabase.from("songs").update(response).eq("id", id);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (req.file) {
    cloudinary.upload(req.file, "songs", id);
  }

  res.status(200).json({ message: `Song ${id} updated successfully` });
  return;
};

const addSong: RequestHandler = async (req: Request, res: Response) => {
  const {
    title,
    description,
    thumbnailurl,
    duration,
    releasedate,
    genre,
    artists,
  } = req.body;

  if (!title) {
    res.status(400).json({ error: "Payload must have field: title" });
    return;
  }

  const response = {
    title,
    ...(description && { description }),
    ...(thumbnailurl && { thumbnailurl }),
    ...(duration && { duration }),
    ...(releasedate && { releasedate }),
    ...(genre && { genre }),
  };

  const { data, error } = await supabase
    .from("songs")
    .insert(response)
    .select("id")
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const promises = artists.map((artistid: string, index: number) =>
    supabase.from("artistssongs").insert({
      songid: data!.id,
      artistid: artistid,
      relation: index === 0 ? "Primary" : "Featured",
    }),
  );

  const results = await Promise.all(promises);
  const errors = results.filter((result) => result.error);

  if (errors.length > 0) {
    res.status(500).json({
      error: `Failed to link associate artists with current song ${data!.id}`,
      details: errors.map((e) => e.error.message),
    });
    return;
  }

  if (req.file) {
    cloudinary.upload(req.file, "songs", data.id);
  }

  res.status(201).json({ message: `Song ${title} created` });
  return;
};

const deleteSong: RequestHandler = async (req: Request, res: Response) => {
  const id = req.params.id;

  const { data, error } = await supabase
    .from("songs")
    .delete()
    .eq("id", id)
    .select("title")
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  backblaze.deleteObject(data.title + ".mp3");
  cloudinary.delete("songs", `i-${id}`);

  res.status(202).json({ message: `Song ${id} is being deleted` });
};

export default {
  getAllSongs,
  getSongByID,
  addSong,
  generatePresignedDownloadURL,
  generatePresignedUploadURL,
  updateSong,
  deleteSong,
};
