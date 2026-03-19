'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  FileInput,
  Group,
  Modal,
  SegmentedControl,
  Slider,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import Cropper, { type Area, type Point } from 'react-easy-crop';

type ImageMode = 'url' | 'upload';

const MAX_IMAGE_BYTES = 1_000_000;
const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossible de lire le fichier'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Impossible de lire le fichier'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function createImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Impossible de charger l'image"));
    image.src = src;
  });
}

async function getCroppedDataUrl(source: string, pixels: Area): Promise<string> {
  const image = await createImage(source);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas indisponible');

  canvas.width = pixels.width;
  canvas.height = pixels.height;

  context.drawImage(
    image,
    pixels.x,
    pixels.y,
    pixels.width,
    pixels.height,
    0,
    0,
    pixels.width,
    pixels.height,
  );

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const base64 = dataUrl.split(',')[1] ?? '';
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) {
    throw new Error("L'image recadree depasse 1MB");
  }
  return dataUrl;
}

interface PlaylistFormModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initialValues?: {
    name?: string;
    description?: string | null;
    image?: string | null;
  };
  onSubmit: (values: { name: string; description?: string; image?: string | null }) => Promise<void>;
}

export default function PlaylistFormModal(props: PlaylistFormModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageMode, setImageMode] = useState<ImageMode>('url');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cropOpen, setCropOpen] = useState(false);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  useEffect(() => {
    if (!props.opened) return;

    const initialImage = props.initialValues?.image ?? null;
    const isDataImage = initialImage?.startsWith('data:image/') ?? false;

    setName(props.initialValues?.name ?? '');
    setDescription(props.initialValues?.description ?? '');
    setImageMode('url');
    setImageUrl(isDataImage ? '' : (initialImage ?? ''));
    setImageFile(null);
    setCroppedImage(isDataImage ? initialImage : null);
    setSaving(false);
    setError(null);
    setCropOpen(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }, [props.opened, props.initialValues?.description, props.initialValues?.image, props.initialValues?.name]);

  const uploadPreviewUrl = useMemo(() => {
    if (!imageFile) return null;
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    };
  }, [uploadPreviewUrl]);

  const cropSource = useMemo(() => {
    if (imageMode === 'upload') {
      return uploadPreviewUrl;
    }
    return imageUrl.trim() || croppedImage;
  }, [croppedImage, imageMode, imageUrl, uploadPreviewUrl]);

  const previewSrc = useMemo(() => {
    if (croppedImage) return croppedImage;
    if (imageMode === 'upload') return uploadPreviewUrl;
    return imageUrl.trim() || null;
  }, [croppedImage, imageMode, imageUrl, uploadPreviewUrl]);

  const handleOpenCrop = async () => {
    setError(null);
    if (!cropSource) {
      setError('Selectionne une image avant de recadrer');
      return;
    }
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropOpen(true);
  };

  const handleApplyCrop = async () => {
    if (!cropSource || !croppedAreaPixels) {
      setError('Impossible de recadrer cette image');
      return;
    }

    try {
      const result = await getCroppedDataUrl(cropSource, croppedAreaPixels);
      setCroppedImage(result);
      setCropOpen(false);
    } catch (e: any) {
      const message =
        e?.message ??
        "Impossible de recadrer cette image. Si c'est une URL externe, verifie le CORS ou utilise upload.";
      setError(message);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Le nom de la playlist est requis');
      return;
    }

    if (imageFile && imageFile.size > MAX_IMAGE_BYTES) {
      setError('Image trop lourde (1MB max)');
      return;
    }
    if (imageFile && !ACCEPTED_MIME_TYPES.includes(imageFile.type as any)) {
      setError('Type non supporte (PNG, JPG, WebP)');
      return;
    }

    try {
      setSaving(true);
      let normalizedImage: string | null = null;

      if (croppedImage) {
        normalizedImage = croppedImage;
      } else if (imageMode === 'upload' && imageFile) {
        normalizedImage = await fileToDataUrl(imageFile);
      } else if (imageMode === 'url') {
        normalizedImage = imageUrl.trim() || null;
      }

      await props.onSubmit({
        name: name.trim(),
        description: description.trim(),
        image: normalizedImage,
      });
      props.onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal opened={props.opened} onClose={props.onClose} title={props.title}>
        <Stack gap="sm">
          <TextInput label="Nom" value={name} onChange={(e) => setName(e.currentTarget.value)} />
          <TextInput
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            placeholder="Optionnel"
          />

          <SegmentedControl
            value={imageMode}
            onChange={(value) => setImageMode(value as ImageMode)}
            data={[
              { label: 'URL', value: 'url' },
              { label: 'Upload', value: 'upload' },
            ]}
            fullWidth
          />

          {imageMode === 'url' ? (
            <TextInput
              label="Image (URL)"
              placeholder="https://..."
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.currentTarget.value);
                setCroppedImage(null);
              }}
            />
          ) : (
            <FileInput
              label="Image (upload)"
              placeholder="PNG, JPG, WebP - 1MB max"
              accept={ACCEPTED_MIME_TYPES.join(',')}
              value={imageFile}
              onChange={(file) => {
                setImageFile(file);
                setCroppedImage(null);
              }}
              clearable
            />
          )}

          <Group justify="space-between">
            <Group gap="xs">
              <Avatar src={previewSrc} radius="md" size={52} />
              <Text size="xs" c="dimmed">
                Apercu
              </Text>
            </Group>
            <Group gap="xs">
              <Button size="xs" variant="light" onClick={handleOpenCrop} disabled={!cropSource}>
                Recadrer
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => {
                  setImageUrl('');
                  setImageFile(null);
                  setCroppedImage(null);
                }}
              >
                Retirer l'image
              </Button>
            </Group>
          </Group>

          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={props.onClose}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} loading={saving} disabled={!name.trim()}>
              {props.submitLabel}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={cropOpen} onClose={() => setCropOpen(false)} title="Recadrer l'image" size="lg">
        <Stack gap="md">
          <div style={{ position: 'relative', width: '100%', height: 320, background: '#111' }}>
            {cropSource && (
              <Cropper
                image={cropSource}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
              />
            )}
          </div>
          <Stack gap={4}>
            <Text size="sm">Zoom</Text>
            <Slider min={1} max={3} step={0.05} value={zoom} onChange={(value) => setZoom(value as number)} />
          </Stack>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCropOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => void handleApplyCrop()}>Appliquer</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
