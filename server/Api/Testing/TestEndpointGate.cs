namespace ProjectHiddenVillage.Server.Api.Testing;

/// <summary>
/// The single gate behind every <c>api/test/**</c> endpoint.
///
/// Those endpoints mutate state without going through the rules the players do, so they answer 404 unless the API
/// runs in Development *and* the test seed profiles are enabled (the e2e start script sets
/// <c>PHV_INCLUDE_TEST_SEED_PROFILES=true</c>). A deployed build therefore cannot reach them even though the routes
/// exist. Keeping the check in one place stops a new test endpoint from quietly shipping with a weaker gate.
/// </summary>
public static class TestEndpointGate
{
    private const string TestEndpointsEnvironmentVariable = "PHV_INCLUDE_TEST_SEED_PROFILES";

    public static bool IsEnabled(
        IWebHostEnvironment environment,
        IConfiguration configuration,
        ILogger logger,
        PathString requestPath)
    {
        if (!environment.IsDevelopment())
        {
            return false;
        }

        if (IsConfigured(configuration))
        {
            return true;
        }

        logger.LogWarning(
            "Refusing a test-endpoint call on {Path}: set {EnvironmentVariable}=true to enable them.",
            requestPath,
            TestEndpointsEnvironmentVariable);

        return false;
    }

    /// <summary>
    /// The configuration half of the gate, without the environment check or the warning. Service registration uses
    /// it to decide whether a test-only collaborator (the recording mail sender) should exist at all.
    /// </summary>
    public static bool IsConfigured(IConfiguration configuration)
    {
        var configured = configuration[TestEndpointsEnvironmentVariable];

        return (bool.TryParse(configured, out var enabled) && enabled) ||
            string.Equals(configured, "1", StringComparison.Ordinal);
    }
}
