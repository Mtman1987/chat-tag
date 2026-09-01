'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getAuthHeaders } from '@/lib/client-auth';
import { quackverseCards } from '@/lib/quackverse-data';

type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

type Props = {
  disabled?: boolean;
  onImported?: () => Promise<void> | void;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
};

function findEndOfCentralDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimum = Math.max(0, bytes.byteLength - 0xffff - 22);
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error('This ZIP does not contain a readable central directory.');
}

function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  let offset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error(`ZIP directory entry ${index + 1} is invalid.`);
    }
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + fileNameLength));
    entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot unpack ZIP files. Use current Chrome, Edge, or another modern Chromium browser.');
  }
  let stream: DecompressionStream;
  try {
    stream = new DecompressionStream('deflate-raw' as CompressionFormat);
  } catch {
    throw new Error('This browser does not support ZIP deflate decompression. Use current Chrome or Edge.');
  }
  const source = new Blob([data]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(source).arrayBuffer());
}

async function extractEntry(bytes: Uint8Array, entry: ZipEntry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (view.getUint32(offset, true) !== 0x04034b50) throw new Error(`Invalid ZIP local header for ${entry.name}.`);
  const fileNameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = bytes.subarray(dataStart, dataStart + entry.compressedSize);

  let output: Uint8Array;
  if (entry.compressionMethod === 0) output = new Uint8Array(compressed);
  else if (entry.compressionMethod === 8) output = await inflateRaw(compressed);
  else throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} in ${entry.name}.`);

  if (entry.uncompressedSize && output.byteLength !== entry.uncompressedSize) {
    throw new Error(`ZIP size check failed for ${entry.name}.`);
  }
  return output;
}

function fileDescriptor(entry: ZipEntry) {
  const baseName = entry.name.split('/').pop() || '';
  const match = baseName.match(/^(\d{3})[_-].+\.([a-z0-9]+)$/i);
  if (!match) return null;
  const cardId = Number(match[1]);
  const extension = match[2].toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) return null;
  return { cardId, baseName, mimeType };
}

export function QuackverseArtZipImport({ disabled = false, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('');
  const knownCardIds = new Set(quackverseCards.map((card) => card.id));

  const importZip = async (file: File | null) => {
    if (!file) return;
    setWorking(true);
    setStatus('Reading ZIP...');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const candidates = readZipEntries(bytes)
        .map((entry) => ({ entry, descriptor: fileDescriptor(entry) }))
        .filter((item): item is { entry: ZipEntry; descriptor: NonNullable<ReturnType<typeof fileDescriptor>> } => Boolean(item.descriptor))
        .filter((item) => knownCardIds.has(item.descriptor.cardId))
        .sort((a, b) => a.descriptor.cardId - b.descriptor.cardId);

      const unique = new Map<number, (typeof candidates)[number]>();
      for (const item of candidates) {
        if (!unique.has(item.descriptor.cardId)) unique.set(item.descriptor.cardId, item);
      }
      const items = [...unique.values()];
      if (!items.length) {
        throw new Error('No numbered Quackverse card images were found. Expected names such as 001_Card_Name.png.');
      }

      let successCount = 0;
      const failures: string[] = [];
      for (let index = 0; index < items.length; index += 1) {
        const { entry, descriptor } = items[index];
        setStatus(`Importing ${index + 1} / ${items.length}: #${descriptor.cardId} ${descriptor.baseName}`);
        try {
          const imageBytes = await extractEntry(bytes, entry);
          const imageFile = new File([imageBytes], descriptor.baseName, { type: descriptor.mimeType });
          const formData = new FormData();
          formData.set('cardId', String(descriptor.cardId));
          formData.set('variant', 'static');
          formData.set('file', imageFile);
          const response = await fetch('/api/quackverse/art', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData,
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
          successCount += 1;
        } catch (error: any) {
          failures.push(`#${descriptor.cardId}: ${error?.message || 'upload failed'}`);
        }
      }

      await onImported?.();
      if (failures.length) {
        setStatus(`Imported ${successCount} / ${items.length}. Failed: ${failures.slice(0, 4).join('; ')}${failures.length > 4 ? `; +${failures.length - 4} more` : ''}`);
      } else {
        setStatus(`Imported all ${successCount} mapped card images successfully.`);
      }
    } catch (error: any) {
      setStatus(error?.message || 'ZIP import failed.');
    } finally {
      setWorking(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-md border border-emerald-300/20 bg-emerald-300/10 p-3">
      <div className="text-sm font-semibold text-white">Bulk static art import</div>
      <div className="mt-1 text-xs text-slate-300">
        Choose the Quackverse art ZIP once. Numbered files such as 001_Card_Name.png are matched to card IDs and saved through the normal protected art route.
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        disabled={disabled || working}
        className="hidden"
        onChange={(event) => void importZip(event.target.files?.[0] || null)}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || working}
        className="mt-3 w-full bg-emerald-400/20 text-emerald-50 hover:bg-emerald-400/30"
        onClick={() => inputRef.current?.click()}
      >
        {working ? 'Importing Card Art...' : 'Import Card Art ZIP'}
      </Button>
      {status && <div className="mt-2 break-words text-xs text-emerald-100">{status}</div>}
    </div>
  );
}
