/** Read while the Android document-provider grant is fresh, then own the bytes. */
export function snapshotFile(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Cannot read ${file.name}. Choose it again or copy it to local device storage.`));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) { reject(new Error('Invalid file data')); return; }
      resolve(new File([reader.result], file.name, { type: file.type, lastModified: file.lastModified }));
    };
    reader.readAsArrayBuffer(file);
  });
}
