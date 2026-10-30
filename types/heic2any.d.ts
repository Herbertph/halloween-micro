declare module "heic2any" {
  interface HeicOptions {
    blob: Blob;
    toType?: string;
    quality?: number;
    multiple?: boolean;
  }
  export default function heic2any(
    options: HeicOptions,
  ): Promise<Blob | Blob[]>;
}
