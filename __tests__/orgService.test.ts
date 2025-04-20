// import {
//     addOrganizationAdmin,
//     createOrganization,
//     updateOrganization,
// } from '../src/models/Organizations';
// import {
//     nonExistingOrg,
//     userId,
//     org,
//     existingOrg,
//     createdOrg,
//     createdUserAdmin,
//     existingOrgsUser,
//     updateOrg,
//     updatedOrganization,
//     publicOrgsArray,
// } from './utils/orgService-test-data';
// import { OrgRepository } from '../src/repositories/orgRepository';
// import { OrgService } from '../src/services/orgService';
// import { UserRole } from '@/models/User';
// import { S3Service } from '../src/services/s3Service';

// // Move mocks to the top level
// jest.mock(`../src/repositories/orgRepository`);
// jest.mock(`../src/services/s3Service`); // Mock the S3Service
// jest.mock(`../src/models/Organizations`, () => ({
//     createOrganization: jest.fn(),
//     addOrganizationAdmin: jest.fn(),
//     updateOrganization: jest.fn(),
// }));

// describe(`User roles tests`, () => {
//     // Initialize the repository and service variables
//     let orgRepository: any;
//     let mockOrgService: any;

//     beforeEach(() => {
//         // Create new instances
//         orgRepository = new OrgRepository();
//         mockOrgService = new OrgService(orgRepository);
//         // Set up the spies after repository is initialized
//         createdUserAdmin.role = UserRole.MEMBER;
//         jest.spyOn(orgRepository, 'findSpecificOrgByUser').mockResolvedValue(createdUserAdmin);
//         jest.spyOn(mockOrgService, 'findSpecificOrgByUser').mockResolvedValue(createdUserAdmin);
//     });

//     test(`User is not an admin`, async () => {
//         const orgServiceWithMock = new OrgService(orgRepository);

//         expect(orgServiceWithMock.validateUserOrgAdmin(createdUserAdmin)).toBe(false);
//     });
// });

// describe(`Positive org tests`, () => {
//     // Initialize the repository variable before using it
//     let orgRepository: any;
//     let mockOrgService: any;
//     let s3Service: any;

//     beforeEach(() => {
//         // Create a new instance of OrgRepository
//         orgRepository = new OrgRepository();
//         mockOrgService = new OrgService(orgRepository);
//         createdUserAdmin.role = UserRole.ADMIN;
//         // Set up the spies after repository is initialized
//         s3Service = new S3Service();

//         // Set up the repository spies
//         jest.spyOn(orgRepository, 'findOrgByName').mockResolvedValue(nonExistingOrg);
//         jest.spyOn(orgRepository, 'createOrg').mockResolvedValue(createdOrg);
//         jest.spyOn(orgRepository, 'createUserAdmin').mockResolvedValue(createdUserAdmin);
//         jest.spyOn(orgRepository, 'findOrgsByUser').mockResolvedValue(existingOrgsUser);
//         jest.spyOn(orgRepository, 'updateOrgByName').mockResolvedValue(updatedOrganization);
//         jest.spyOn(orgRepository, 'findSpecificOrgByUser').mockResolvedValue(createdUserAdmin);
//         jest.spyOn(orgRepository, 'findAllPublicOrgs').mockResolvedValue(publicOrgsArray);

//         jest.spyOn(mockOrgService, 'validateUrl');
//         jest.spyOn(mockOrgService, 'findSpecificOrgByUser').mockResolvedValue(createdUserAdmin);

//         // Set up S3Service mocks
//         jest.spyOn(s3Service, 'uploadLogoFromUrl').mockResolvedValue(`mocked-s3-key`);
//         jest.spyOn(s3Service, 'getLogoPreSignedUrl').mockResolvedValue(
//             `https://presigned-url.example.com`
//         );

//         // Mock models function
//         (createOrganization as jest.Mock).mockReturnValue(createdOrg);
//         (addOrganizationAdmin as jest.Mock).mockReturnValue(createdUserAdmin);
//         (updateOrganization as jest.Mock).mockReturnValue(updatedOrganization);
//     });

//     afterEach(() => {
//         jest.clearAllMocks();
//     });
//     test(`Organization created`, async () => {
//         const orgServiceWithMock = new OrgService(orgRepository, s3Service);
//         const result = await orgServiceWithMock.createOrg(org, userId);

//         expect(orgRepository.findOrgByName).toHaveBeenCalled();
//         expect(s3Service.uploadLogoFromUrl).toHaveBeenCalledWith(org.logoUrl, org.name);
//         expect(s3Service.getLogoPreSignedUrl).toHaveBeenCalledWith(`mocked-s3-key`);
//         expect(orgRepository.createOrg).toHaveBeenCalled();
//         expect(result).toEqual(
//             expect.objectContaining({
//                 name: org.name,
//                 logoUrl: expect.any(String),
//                 logoS3Key: expect.any(String),
//             })
//         );
//     });

//     test(`UserAdmin created`, async () => {
//         const orgServiceWithMock = new OrgService(orgRepository, s3Service);
//         const result = await orgServiceWithMock.createUserAdmin(org.name, userId);

//         expect(orgRepository.createUserAdmin).toHaveBeenCalled();
//         expect(result).toBe(createdUserAdmin);
//     });

//     test(`Get all organizations`, async () => {
//         const orgServiceWithMock = new OrgService(orgRepository, s3Service);
//         const result = await orgServiceWithMock.findOrgsByUser(userId);

//         expect(orgRepository.findOrgsByUser).toHaveBeenCalled();
//         // Update the expectation - don't check for getLogoPreSignedUrl since our test data doesn't have logoS3Key
//         // Only organizations with logoS3Key would trigger getLogoPreSignedUrl
//         expect(result).toBe(existingOrgsUser);
//     });

//     test(`Updating Organization`, async () => {
//         mockOrgService.validateUrl(updateOrg.website);
//         mockOrgService.validateUrl(updateOrg.logoUrl);
//         orgRepository.findOrgByName.mockResolvedValue(existingOrg);

//         const orgServiceWithMock = new OrgService(orgRepository);

//         const result = await orgServiceWithMock.updateOrgByName(updateOrg, userId);

//         expect(mockOrgService.validateUrl).toHaveBeenCalledTimes(2);
//         expect(mockOrgService.validateUrl).toHaveBeenLastCalledWith(updateOrg.logoUrl);
//         expect(orgRepository.findOrgByName).toHaveBeenCalled();
//         expect(result).toBe(updatedOrganization);
//     });

//     test(`Get all public organizations`, async () => {
//         const orgServiceWithMock = new OrgService(orgRepository);
//         const result = await orgServiceWithMock.findAllPublicOrgs();

//         expect(orgRepository.findAllPublicOrgs).toHaveBeenCalled();
//         expect(result).toBe(publicOrgsArray);
//     });
// });

// describe(`Negative org tests`, () => {
//     // Initialize the repository and service variables
//     let orgRepository: any;
//     let mockOrgService: any;
//     let s3Service: any;

//     beforeEach(() => {
//         // Create new instances
//         orgRepository = new OrgRepository();
//         mockOrgService = new OrgService(orgRepository);
//         s3Service = new S3Service();

//         // Default mocks for S3Service
//         jest.spyOn(s3Service, 'uploadLogoFromUrl').mockResolvedValue(`mocked-s3-key`);
//         jest.spyOn(s3Service, 'getLogoPreSignedUrl').mockResolvedValue(
//             `https://presigned-url.example.com`
//         );
//     });

//     afterEach(() => {
//         jest.clearAllMocks();
//         // Reset org object if modified in tests
//         org.name = `Jollibee`;
//         org.logoUrl = `https://images.app.goo.gl/k7Yc6Yb6ebeaB9HB8`;
//     });

//     test(`Organization with the same name`, async () => {
//         jest.spyOn(orgRepository, 'findOrgByName').mockResolvedValue(existingOrg);
//         const orgServiceWithMock = new OrgService(orgRepository, s3Service);

//         await expect(orgServiceWithMock.createOrg(org, userId)).rejects.toThrow(
//             `Organization name already in use!`
//         );

//         // S3 upload should never be called since we fail the name check first
//         expect(s3Service.uploadLogoFromUrl).not.toHaveBeenCalled();
//     });

//     test(`Organization without name`, async () => {
//         org.name = ``;
//         const orgServiceWithMock = new OrgService(orgRepository, s3Service);

//         await expect(orgServiceWithMock.createOrg(org, userId)).rejects.toThrow(
//             `Organization name is required`
//         );
        

//         // S3 upload should never be called since we fail the name validation first
//         expect(s3Service.uploadLogoFromUrl).not.toHaveBeenCalled();
//     });

//     test(`Organization with invalid logo`, async () => {
//         org.logoUrl = `invalid logo`;
//         const orgServiceWithMock = new OrgService(orgRepository, s3Service);

//         await expect(orgServiceWithMock.createOrg(org, userId)).rejects.toThrow(`Invalid URL`);

//         // S3 upload should never be called since we fail the URL validation first
//         expect(s3Service.uploadLogoFromUrl).not.toHaveBeenCalled();
//     });

//     test(`Organization with invalid User`, async () => {
//         const orgServiceWithMock = new OrgService(orgRepository);

//         await expect(orgServiceWithMock.findOrgsByUser(`invalidId`)).rejects.toThrow(
//             `No Organizations found!`
//         );
//     });

//     test(`Updating Organization without name`, async () => {
//         updateOrg.name = ``;
//         const orgServiceWithMock = new OrgService(orgRepository);

//         await expect(orgServiceWithMock.updateOrgByName(updateOrg, userId)).rejects.toThrow(
//             `You need to specify the Organization name.`
//         );
//     });

//     test(`Updating Organization as a non-member`, async () => {
//         jest.spyOn(orgRepository, 'findSpecificOrgByUser').mockResolvedValue(null);
//         const orgServiceWithMock = new OrgService(orgRepository);

//         await expect(
//             orgServiceWithMock.findSpecificOrgByUser(updateOrg.name, userId)
//         ).rejects.toThrow(`You are NOT part of this Organization`);
//         expect(orgRepository.findSpecificOrgByUser).toHaveBeenCalled();
//     });

//     test(`Using invalid URL`, async () => {
//         org.logoUrl = `invalid logo`;
//         const orgServiceWithMock = new OrgService(orgRepository);

//         await expect(orgServiceWithMock.validateUrl(org.logoUrl)).rejects.toThrow(`Invalid URL`);
//     });

//     test(`No organizations found for user`, async () => {
//         jest.spyOn(orgRepository, 'findOrgsByUser').mockResolvedValue(null);
//         const orgServiceWithMock = new OrgService(orgRepository, s3Service);

//         await expect(orgServiceWithMock.findOrgsByUser(`invalidId`)).rejects.toThrow(
//             `No Organizations found!`
//         );
//     });
// });
