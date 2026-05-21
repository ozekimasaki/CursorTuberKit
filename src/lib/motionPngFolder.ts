export function deriveMotionPngFolderLabel(files: File[]) {
  const firstPath = files[0]?.webkitRelativePath
  if (firstPath) {
    const [folderName] = firstPath.split(/[\\/]/)
    if (folderName) {
      return folderName
    }
  }

  return "MotionPNGTuber フォルダ"
}
