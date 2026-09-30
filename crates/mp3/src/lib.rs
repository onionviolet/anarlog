mod encoder;
mod error;
mod segment;
mod wav;

pub use encoder::{Mono, MonoStreamEncoder, Stereo, StereoStreamEncoder, StreamEncoder};
pub use error::Error;
pub use segment::encode_mono_segments;
pub use segment::encode_mono_segments_with_overlap;
pub use wav::{concat_files, decode_to_wav, encode_wav};
