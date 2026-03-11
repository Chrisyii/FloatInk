use tauri::{Runtime, WebviewWindow};

#[cfg(target_os = "macos")]
fn apply_overlay_window_level(ns_window: &objc2_app_kit::NSWindow) {
    use objc2_app_kit::NSWindowCollectionBehavior;
    use objc2_core_graphics::CGShieldingWindowLevel;

    ns_window.setLevel(CGShieldingWindowLevel() as isize + 1);

    let mut behavior = ns_window.collectionBehavior();
    behavior.insert(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::MoveToActiveSpace
            | NSWindowCollectionBehavior::Stationary,
    );
    ns_window.setCollectionBehavior(behavior);
}

#[cfg(target_os = "macos")]
pub fn present<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let _ = window.show();

    window.with_webview(|webview| unsafe {
        let ns_window: &objc2_app_kit::NSWindow = &*webview.ns_window().cast();
        apply_overlay_window_level(ns_window);
        ns_window.orderFrontRegardless();
    })
}

#[cfg(not(target_os = "macos"))]
pub fn present<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let _ = window.show();
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn reinforce_level<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    window.with_webview(|webview| unsafe {
        let ns_window: &objc2_app_kit::NSWindow = &*webview.ns_window().cast();
        apply_overlay_window_level(ns_window);
    })
}

#[cfg(not(target_os = "macos"))]
pub fn reinforce_level<R: Runtime>(_window: &WebviewWindow<R>) -> tauri::Result<()> {
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn attach<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    use objc2::{MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSAutoresizingMaskOptions, NSColor, NSView, NSWindow, NSWindowOrderingMode,
    };
    use objc2_metal::{MTLCreateSystemDefaultDevice, MTLPixelFormat};
    use objc2_quartz_core::CAMetalLayer;

    window.with_webview(|webview| unsafe {
        let ns_window: &NSWindow = &*webview.ns_window().cast();
        ns_window.setOpaque(false);
        ns_window.setHasShadow(false);
        ns_window.setHidesOnDeactivate(false);
        apply_overlay_window_level(ns_window);

        let tint = NSColor::colorWithDeviceRed_green_blue_alpha(1.0, 1.0, 1.0, 0.01);
        ns_window.setBackgroundColor(Some(&tint));

        let Some(content_view) = ns_window.contentView() else {
            return;
        };

        let frame = content_view.bounds();
        let mtm = MainThreadMarker::new_unchecked();
        let metal_host_view = NSView::initWithFrame(NSView::alloc(mtm), frame);
        metal_host_view.setAutoresizingMask(
            NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
        );
        metal_host_view.setWantsLayer(true);

        let metal_layer = CAMetalLayer::new();
        metal_layer.setOpaque(false);
        metal_layer.setFramebufferOnly(false);

        if let Some(device) = MTLCreateSystemDefaultDevice() {
            metal_layer.setDevice(Some(device.as_ref()));
            metal_layer.setPixelFormat(MTLPixelFormat::BGRA8Unorm);
        }

        metal_host_view.setLayer(Some(&metal_layer));

        let webview_view: &NSView = &*webview.inner().cast();
        content_view.addSubview_positioned_relativeTo(
            &metal_host_view,
            NSWindowOrderingMode::Below,
            Some(webview_view),
        );
    })
}

#[cfg(not(target_os = "macos"))]
pub fn attach<R: Runtime>(_window: &WebviewWindow<R>) -> tauri::Result<()> {
    Ok(())
}
