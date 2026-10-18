using Microsoft.VisualStudio.TestTools.UnitTesting;

// These tests are pure engine/service tests: they build their own in-memory game instances and
// Entity Framework in-memory contexts, and share no fixtures, so they can run concurrently.
// Without this assembly attribute MSTest runs every method sequentially, which is why the suite
// scaled with test count instead of with cores.
//
// `Workers = 0` means "use the machine's core count". A class that turns out to share mutable
// state must opt out with [DoNotParallelize] rather than forcing the whole assembly back to serial.
[assembly: Parallelize(Workers = 0, Scope = ExecutionScope.MethodLevel)]
