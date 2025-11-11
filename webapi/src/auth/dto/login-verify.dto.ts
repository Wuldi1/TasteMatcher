import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

/**
 * DTO for verifying login code
 */
export class LoginVerifyDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    @Length(6, 6)
    code: string;

    constructor() {
        this.email = '';
        this.code = '';
    }
}
