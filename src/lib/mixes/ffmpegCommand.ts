import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function resolveFfmpegCommand(): Promise<string | null> {
  const isWindows = process.platform === 'win32';
  const primary = isWindows ? 'ffmpeg.exe' : 'ffmpeg';

  try {
    await execAsync(isWindows ? 'where ffmpeg.exe' : 'which ffmpeg');
    return primary;
  } catch {
    if (isWindows) {
      try {
        await execAsync('where ffmpeg');
        return 'ffmpeg';
      } catch {
        return null;
      }
    }
    return null;
  }
}
