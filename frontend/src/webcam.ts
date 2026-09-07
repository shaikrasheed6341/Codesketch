export async function getWebcamStream(): Promise<MediaStream> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true ,audio:true });
    return stream;
  } catch (error) {
    console.error("Error accessing webcam:", error);
    throw error;
  }
}