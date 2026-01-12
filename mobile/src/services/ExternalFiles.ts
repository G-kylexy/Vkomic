import { NativeModules, Platform } from "react-native";

type ExternalFilesModule = {
  getExternalFilesDir: () => Promise<string>;
  revealFile: (path: string) => Promise<void>;
};

const mod: ExternalFilesModule | undefined = NativeModules.ExternalFiles;

export const getExternalFilesDir = async () => {
  if (Platform.OS !== "android" || !mod?.getExternalFilesDir) return null;
  try {
    return await mod.getExternalFilesDir();
  } catch {
    return null;
  }
};

export const revealFile = async (path: string) => {
  if (Platform.OS !== "android" || !mod?.revealFile) return false;
  try {
    await mod.revealFile(path);
    return true;
  } catch (e) {
    console.warn("revealFile failed", e);
    return false;
  }
};
