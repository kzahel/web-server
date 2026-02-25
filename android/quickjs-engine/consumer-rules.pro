# Keep QuickJS JNI native methods when consumed by app
-keep class app.ok200.quickjs.QuickJsContext {
    native <methods>;
}
