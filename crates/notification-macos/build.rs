#[cfg(target_os = "macos")]
#[path = "../../build-support/swift_link_layout.rs"]
mod swift_link_layout;

fn main() {
    #[cfg(target_os = "macos")]
    {
        swift_rs::SwiftLinker::new("14.2")
            .with_package("notification-swift", "./swift-lib/")
            .link();
        swift_link_layout::stage_static_library("notification-swift");
    }

    #[cfg(not(target_os = "macos"))]
    {
        println!("cargo:warning=Swift linking is only available on macOS");
    }
}
