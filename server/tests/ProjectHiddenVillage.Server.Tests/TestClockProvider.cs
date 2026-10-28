namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// A controllable <see cref="TimeProvider"/> for the action-clock tests: the current time only moves when
/// <see cref="Advance"/> is called, and that call fires every timer whose due time has been reached. It is what
/// lets a test drive a 60-second phase budget, a 30-minute pool and a three-strike forfeit without waiting.
///
/// Only the pieces the registry uses are implemented (the current time and one-shot timers); anything else falls
/// back to <see cref="TimeProvider"/>'s defaults, which throw - a test that needs them would have to add them.
/// </summary>
internal sealed class TestClockProvider : TimeProvider
{
    private readonly object syncRoot = new();
    private readonly List<TestTimer> timers = [];

    private DateTimeOffset utcNow;

    public TestClockProvider(DateTimeOffset utcNow)
    {
        this.utcNow = utcNow;
    }

    public override DateTimeOffset GetUtcNow()
    {
        lock (syncRoot)
        {
            return utcNow;
        }
    }

    public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
    {
        ArgumentNullException.ThrowIfNull(callback);

        var timer = new TestTimer(this, callback, state, dueTime);

        lock (syncRoot)
        {
            timers.Add(timer);
        }

        return timer;
    }

    /// <summary>
    /// Moves time forward and fires, oldest due first, every timer that has come due. Timers armed by a callback
    /// are picked up by the next <see cref="Advance"/> call, so a timeout that arms the next stop is deterministic.
    /// </summary>
    public void Advance(TimeSpan delta)
    {
        if (delta < TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(delta), "Time cannot move backwards.");
        }

        lock (syncRoot)
        {
            utcNow += delta;
        }

        while (true)
        {
            TestTimer? next;

            lock (syncRoot)
            {
                next = timers
                    .Where(timer => timer.IsDue(utcNow))
                    .OrderBy(timer => timer.DueAtUtc)
                    .FirstOrDefault();
            }

            if (next is null)
            {
                return;
            }

            next.Fire();
        }
    }

    private sealed class TestTimer : ITimer
    {
        private readonly TestClockProvider owner;
        private readonly TimerCallback callback;
        private readonly object? state;

        public TestTimer(TestClockProvider owner, TimerCallback callback, object? state, TimeSpan dueTime)
        {
            this.owner = owner;
            this.callback = callback;
            this.state = state;
            DueAtUtc = owner.GetUtcNow() + (dueTime < TimeSpan.Zero ? TimeSpan.Zero : dueTime);
        }

        public DateTimeOffset DueAtUtc { get; private set; }

        public bool IsDisposed { get; private set; }

        public bool IsDue(DateTimeOffset now)
        {
            return !IsDisposed && DueAtUtc <= now;
        }

        public void Fire()
        {
            // One-shot, like the watchdogs it stands in for: a fired timer is never due again.
            DueAtUtc = DateTimeOffset.MaxValue;
            callback(state);
        }

        public bool Change(TimeSpan dueTime, TimeSpan period)
        {
            DueAtUtc = owner.GetUtcNow() + (dueTime < TimeSpan.Zero ? TimeSpan.Zero : dueTime);
            return true;
        }

        public void Dispose()
        {
            IsDisposed = true;
        }

        public ValueTask DisposeAsync()
        {
            Dispose();
            return ValueTask.CompletedTask;
        }
    }
}
