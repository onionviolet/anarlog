// Xcode 27 writes Swift static products to out/Products instead of the
// target-triple directory searched by our pinned swift-rs linker.

use std::{env, fs, path::PathBuf};

pub fn stage_static_library(package: &str) {
    println!("cargo:rerun-if-changed=../../build-support/swift_link_layout.rs");

    let out_dir = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR is set by Cargo"));
    let package_dir = out_dir.join("swift-rs").join(package);
    let debug = env::var("DEBUG").as_deref() == Ok("true");
    let configuration = if debug { "Debug" } else { "Release" };
    let arch = match env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        Ok("x86_64") => "x86_64",
        other => panic!("unsupported Swift target architecture: {other:?}"),
    };
    let filename = format!("lib{package}.a");
    let destination = package_dir
        .join(format!("{arch}-apple-macosx"))
        .join(configuration.to_lowercase())
        .join(&filename);
    let relocated = package_dir
        .join("out")
        .join("Products")
        .join(configuration)
        .join(&filename);

    if relocated.is_file() {
        fs::create_dir_all(
            destination
                .parent()
                .expect("library has a parent directory"),
        )
        .expect("create Swift linker search directory");
        fs::copy(&relocated, &destination).expect("stage relocated Swift static library");
    } else if !destination.is_file() {
        panic!(
            "Swift library {filename} was not found at {} or {}",
            destination.display(),
            relocated.display()
        );
    }
}
