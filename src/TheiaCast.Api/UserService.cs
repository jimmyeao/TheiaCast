using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;

namespace TheiaCast.Api;

public interface IUserService
{
    Task<IEnumerable<UserListDto>> GetAllAsync();
    Task<UserListDto?> GetByIdAsync(int id);
    Task<UserListDto> CreateAsync(CreateUserDto dto);
    Task<UserListDto> UpdateAsync(int id, UpdateUserDto dto);
    Task DeleteAsync(int id, int currentUserId);
}

public class UserService : IUserService
{
    private readonly PdsDbContext _db;
    private readonly ILogger<UserService> _logger;

    public UserService(PdsDbContext db, ILogger<UserService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<IEnumerable<UserListDto>> GetAllAsync()
    {
        var users = await _db.Users
            .Select(u => new UserListDto(
                u.Id,
                u.Username,
                u.Email,
                u.DisplayName,
                u.IsMfaEnabled,
                u.LastLoginAt
            ))
            .ToListAsync();

        return users;
    }

    public async Task<UserListDto?> GetByIdAsync(int id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user == null) return null;

        return new UserListDto(
            user.Id,
            user.Username,
            user.Email,
            user.DisplayName,
            user.IsMfaEnabled,
            user.LastLoginAt
        );
    }

    public async Task<UserListDto> CreateAsync(CreateUserDto dto)
    {
        // Validate username uniqueness
        if (await _db.Users.AnyAsync(u => u.Username == dto.Username))
        {
            throw new InvalidOperationException("Username already exists");
        }

        // Validate email uniqueness if provided
        if (!string.IsNullOrWhiteSpace(dto.Email))
        {
            if (await _db.Users.AnyAsync(u => u.Email == dto.Email))
            {
                throw new InvalidOperationException("Email already exists");
            }
        }

        // Validate password strength
        if (string.IsNullOrWhiteSpace(dto.Password) || dto.Password.Length < 6)
        {
            throw new InvalidOperationException("Password must be at least 6 characters");
        }

        // Hash password with bcrypt
        var passwordHash = HashPassword(dto.Password);

        var user = new User
        {
            Username = dto.Username,
            PasswordHash = passwordHash,
            PasswordVersion = "bcrypt",
            Email = dto.Email,
            DisplayName = dto.DisplayName,
            IsMfaEnabled = false
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        _logger.LogInformation("User created: {Username} (ID: {Id})", user.Username, user.Id);

        return new UserListDto(
            user.Id,
            user.Username,
            user.Email,
            user.DisplayName,
            user.IsMfaEnabled,
            user.LastLoginAt
        );
    }

    public async Task<UserListDto> UpdateAsync(int id, UpdateUserDto dto)
    {
        var user = await _db.Users.FindAsync(id);
        if (user == null)
        {
            throw new InvalidOperationException("User not found");
        }

        // Validate email uniqueness if changed
        if (!string.IsNullOrWhiteSpace(dto.Email) && dto.Email != user.Email)
        {
            if (await _db.Users.AnyAsync(u => u.Email == dto.Email && u.Id != id))
            {
                throw new InvalidOperationException("Email already exists");
            }
            user.Email = dto.Email;
        }

        // Update display name if provided
        if (dto.DisplayName != null)
        {
            user.DisplayName = dto.DisplayName;
        }

        // Update password if provided
        if (!string.IsNullOrWhiteSpace(dto.Password))
        {
            if (dto.Password.Length < 6)
            {
                throw new InvalidOperationException("Password must be at least 6 characters");
            }
            user.PasswordHash = HashPassword(dto.Password);
        }

        await _db.SaveChangesAsync();

        _logger.LogInformation("User updated: {Username} (ID: {Id})", user.Username, user.Id);

        return new UserListDto(
            user.Id,
            user.Username,
            user.Email,
            user.DisplayName,
            user.IsMfaEnabled,
            user.LastLoginAt
        );
    }

    public async Task DeleteAsync(int id, int currentUserId)
    {
        // Prevent self-deletion
        if (id == currentUserId)
        {
            throw new InvalidOperationException("Cannot delete your own account");
        }

        var user = await _db.Users.FindAsync(id);
        if (user == null)
        {
            throw new InvalidOperationException("User not found");
        }

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();

        _logger.LogInformation("User deleted: {Username} (ID: {Id})", user.Username, user.Id);
    }

    private static string HashPassword(string password)
    {
        return BCrypt.Net.BCrypt.HashPassword(password, BCrypt.Net.BCrypt.GenerateSalt(12));
    }
}
