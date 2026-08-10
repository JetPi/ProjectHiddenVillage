using ErrorOr;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.DTOs;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

public sealed class UserService : IUserService
{
    private readonly ApplicationDbContext dbContext;
    private readonly IPasswordHasher<User> passwordHasher;

    public UserService(ApplicationDbContext dbContext, IPasswordHasher<User> passwordHasher)
    {
        this.dbContext = dbContext;
        this.passwordHasher = passwordHasher;
    }

    public async Task<ErrorOr<UserResponse>> CreateUser(UserDto userDto)
    {
        ArgumentNullException.ThrowIfNull(userDto);

        var email = userDto.Email.Trim();

        var userExists = await dbContext.Users.AnyAsync(user => user.Email == email);
        if (userExists)
        {
            return Error.Conflict(
                code: "User.EmailAlreadyExists",
                description: "A user with this email already exists.");
        }

        var user = ToEntity(userDto);
        user.PasswordHash = passwordHasher.HashPassword(user, userDto.Password);

        dbContext.Users.Add(user);

        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Error.Failure(
                code: "User.Create.PersistFailed",
                description: "User could not be persisted.");
        }

        return ToResponse(user);
    }

    public async Task<ErrorOr<string>> VerifyLogin(UserLoginDto loginDto)
    {
        ArgumentNullException.ThrowIfNull(loginDto);

        var normalizedEmail = loginDto.Email.Trim();
        var user = await dbContext.Users.SingleOrDefaultAsync(record => record.Email == normalizedEmail);
        if (user is null)
        {
            return Error.NotFound(
                code: "Auth.UserNotFound",
                description: "No user exists for the provided email.");
        }

        var verificationResult = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, loginDto.Password);
        if (verificationResult == PasswordVerificationResult.Failed)
        {
            return Error.Unauthorized(
                code: "Auth.InvalidCredentials",
                description: "Email or password is incorrect.");
        }

        if (verificationResult == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = passwordHasher.HashPassword(user, loginDto.Password);

            try
            {
                await dbContext.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                return Error.Failure(
                    code: "Auth.RehashPersistFailed",
                    description: "Login succeeded, but password rehash could not be persisted.");
            }
        }

        return user.Id.ToString();
    }

    public async Task<ErrorOr<UserResponse>> GetUser(string userId)
    {
        if (!Guid.TryParse(userId, out var parsedUserId))
        {
            return Error.Validation(
                code: "User.Get.InvalidId",
                description: "User id must be a valid GUID.");
        }

        var user = await dbContext.Users.SingleOrDefaultAsync(record => record.Id == parsedUserId);
        if (user is null)
        {
            return Error.NotFound(
                code: "User.Get.NotFound",
                description: $"User '{userId}' was not found.");
        }

        return ToResponse(user);
    }

    public async Task<ErrorOr<PagedResponse<UserResponse>>> GetUsers(int page = 1, int pageSize = 100)
    {
        var normalizedPage = page <= 0 ? 1 : page;
        var normalizedPageSize = pageSize <= 0 ? 100 : Math.Min(pageSize, 100);

        var totalCount = await dbContext.Users.CountAsync();
        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)normalizedPageSize);

        var users = await dbContext.Users
            .AsNoTracking()
            .OrderBy(record => record.Email)
            .Skip((normalizedPage - 1) * normalizedPageSize)
            .Take(normalizedPageSize)
            .Select(record => new UserResponse(record.Id, record.Username, record.Email))
            .ToListAsync();

        return new PagedResponse<UserResponse>(
            Page: normalizedPage,
            PageSize: normalizedPageSize,
            TotalCount: totalCount,
            TotalPages: totalPages,
            Items: users);
    }

    private static User ToEntity(UserDto userDto)
    {
        ArgumentNullException.ThrowIfNull(userDto);

        return new User
        {
            Username = userDto.Username.Trim(),
            Email = userDto.Email.Trim()
        };
    }

    private static UserResponse ToResponse(User user)
    {
        ArgumentNullException.ThrowIfNull(user);
        return new UserResponse(user.Id, user.Username, user.Email);
    }
}
