#[cfg(target_os = "macos")]
#[path = "../../build-support/swift_link_layout.rs"]
mod swift_link_layout;

fn main() {
    #[cfg(target_os = "macos")]
    {
        swift_rs::SwiftLinker::new("14.2")
            .with_package("intercept-swift", "./swift-lib/")
            .link();
        swift_link_layout::stage_static_library("intercept-swift");
        ensure_swift_runtime_exports();
    }

    #[cfg(not(target_os = "macos"))]
    {
        println!("cargo:warning=Swift linking is only available on macOS");
    }
}

#[cfg(target_os = "macos")]
fn ensure_swift_runtime_exports() {
    use std::{env, path::PathBuf, process::Command};

    let out = PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("swift-rs/intercept-swift");
    let arch = match env::var("CARGO_CFG_TARGET_ARCH").unwrap().as_str() {
        "aarch64" => "arm64",
        "x86_64" => "x86_64",
        arch => panic!("unsupported Swift target architecture: {arch}"),
    };
    let configuration = if env::var("DEBUG").as_deref() == Ok("true") {
        "debug"
    } else {
        "release"
    };
    let archive = out.join(format!(
        "{arch}-apple-macosx/{configuration}/libintercept-swift.a"
    ));
    let has_exports = || {
        let output = Command::new("nm")
            .arg("-g")
            .arg(&archive)
            .output()
            .expect("inspect SwiftRs exports");
        let symbols = String::from_utf8_lossy(&output.stdout);
        output.status.success()
            && [
                "retain_object",
                "release_object",
                "data_from_bytes",
                "string_from_bytes",
            ]
            .iter()
            .all(|name| symbols.contains(&format!(" T _{name}")))
    };
    if has_exports() {
        return;
    }

    // Xcode 27's release builder can omit SwiftRs C exports; native SwiftPM preserves them.
    let sdk = Command::new("xcrun")
        .args(["--sdk", "macosx", "--show-sdk-path"])
        .output()
        .expect("locate macOS SDK");
    assert!(sdk.status.success(), "macOS SDK lookup failed");
    let status = Command::new("swift")
        .args([
            "build",
            "--build-system",
            "native",
            "--package-path",
            "./swift-lib",
            "--configuration",
            configuration,
            "--triple",
            &format!("{arch}-apple-macosx14.2"),
        ])
        .arg("--build-path")
        .arg(&out)
        .arg("--sdk")
        .arg(String::from_utf8_lossy(&sdk.stdout).trim())
        .status()
        .expect("build SwiftRs C exports");
    assert!(
        status.success() && has_exports(),
        "intercept archive lacks SwiftRs C exports"
    );
}
