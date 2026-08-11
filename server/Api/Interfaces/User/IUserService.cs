using ErrorOr;
using ProjectHiddenVillage.Server.Data.DTOs;

namespace ProjectHiddenVillage.Server;

public interface IUserService
{
    Task<ErrorOr<UserResponse>> CreateUser(UserDto userDto);

    Task<ErrorOr<string>> VerifyLogin(UserLoginDto loginDto);

    Task<ErrorOr<UserResponse>> GetUser(string userId);

    Task<ErrorOr<PagedResponse<UserResponse>>> GetUsers(int page = 1, int pageSize = 100);
}
