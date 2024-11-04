import { cloudinary } from "@/services/cloudinary";
import supabase from "@/services/supabase";
import { Request, RequestHandler, Response } from "express";

const getAllArtists: RequestHandler = async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;

  const { data, error } = await supabase
    .from("artists")
    .select("id, name, avatarurl")
    .range((page - 1) * limit, page * limit - 1);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ data });
  return;
};

const getArtistByID: RequestHandler = async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("artists")
    .select()
    .eq("id", req.params.id);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ data });
  return;
};

const updateArtist: RequestHandler = async (req: Request, res: Response) => {
  const id = req.params.id;
  const { name, description, avatarurl, country } = req.body;

  const response = {
    name,
    ...(description && { description }),
    ...(avatarurl && { avatarurl }),
    ...(country && { country }),
  };

  const { error } = await supabase
    .from("artists")
    .update(response)
    .eq("id", id);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (req.file) {
    cloudinary.upload(req.file, "artists", id);
  }

  res.status(200).json({ message: `Artist ${id} updated successfully` });
  return;
};

const addArtist: RequestHandler = async (req: Request, res: Response) => {
  const { name, description, avatarurl, country } = req.body;

  if (!name) {
    res.status(400).json({ error: "Payload must have field: name" });
    return;
  }

  const response = {
    name,
    ...(description && { description }),
    ...(avatarurl && { avatarurl }),
    ...(country && { country }),
  };

  const { data, error } = await supabase
    .from("artists")
    .insert(response)
    .select("id")
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (req.file) {
    cloudinary.upload(req.file, "artists", data.id);
  }

  res.status(201).json({ message: `Artist ${name} created` });
  return;
};

const deleteArtist: RequestHandler = async (req: Request, res: Response) => {
  const id = req.params.id;

  const { error } = await supabase
    .from("artists")
    .delete()
    .eq("id", id)
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  cloudinary.delete("artists", `i-${id}`);

  res.status(200).json({ message: `Artist ${id} deleted` });
};

export default {
  getAllArtists,
  getArtistByID,
  addArtist,
  updateArtist,
  deleteArtist,
};
