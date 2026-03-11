use tauri::{Runtime, WebviewWindow};

/// Attach a transparent Metal layer behind the Webview to eliminate
/// the white flash that occurs with standard Tauri transparent windows.
#[cfg(target_os = "macos")]
pub fn attach<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    use objc2::{MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSAutoresizingMaskOptions, NSColor, NSView, NSWindow, NSWindowOrderingMode,
    };
    use objc2_metal::{MTLCreateSystemDefaultDevice, MTLPixelFormat};
    use objc2_quartz_core::CAMetalLayer;

    window.with_webview(|webview| unsafe {
        let ns_window_ptr = webview.ns_window();
        if ns_window_ptr.is_null() {
            eprintln!("[floatink] attach: ns_window pointer is null, skipping");
            return;
        }
        let ns_window: &NSWindow = &*ns_window_ptr.cast();

        // Make the window truly transparent
        ns_window.setOpaque(false);
        ns_window.setHasShadow(false);

        // Near-transparent background to avoid white flash
        let tint = NSColor::colorWithDeviceRed_green_blue_alpha(1.0, 1.0, 1.0, 0.01);
        ns_window.setBackgroundColor(Some(&tint));

        let Some(content_view) = ns_window.contentView() else {
            return;
        };

        let frame = content_view.bounds();
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        let metal_host_view = NSView::initWithFrame(NSView::alloc(mtm), frame);
        metal_host_view.setAutoresizingMask(
            NSAutoresizingMaskOptions::ViewWidthSizable
                | NSAutoresizingMaskOptions::ViewHeightSizable,
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
