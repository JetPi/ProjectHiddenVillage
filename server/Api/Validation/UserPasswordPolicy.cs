using FluentValidation;

namespace ProjectHiddenVillage.Server;

/// <summary>
/// The single definition of an acceptable password. Sign-up and recovery both apply it, so a reset can never leave
/// an account with a weaker password than the registration form would have accepted - which is exactly the hole a
/// recovery-only flow would otherwise open.
/// </summary>
public static class UserPasswordPolicy
{
    public const int MinimumLength = 10;

    /// <summary>
    /// The hasher would accept far more, but a cap keeps a single request from spending real CPU on a password
    /// nobody typed. 128 also stays under every common copy-paste limit.
    /// </summary>
    public const int MaximumLength = 128;

    public static string RequirementMessage =>
        $"Password must be between {MinimumLength} and {MaximumLength} characters.";

    public static IRuleBuilderOptions<T, string> ApplyUserPasswordPolicy<T>(
        this IRuleBuilder<T, string> ruleBuilder)
    {
        return ruleBuilder
            .NotEmpty().WithMessage("Password is required.")
            .Length(MinimumLength, MaximumLength).WithMessage(RequirementMessage);
    }
}
